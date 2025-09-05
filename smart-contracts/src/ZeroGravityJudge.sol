// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

/// @title ZeroGravity Judge - P2P escrow + arbitration with M-of-N signed receipts
contract ZeroGravityJudge is EIP712 {
    using SafeERC20 for IERC20;

    // ----- Errors -----
    error NotParty();
    error InvalidParams();
    error AlreadyFunded();
    error NotFunded();
    error AlreadyResolved();
    error NotArbitrator();
    error DuplicateReceipt();
    error ConfidenceTooLow();
    error UnknownWinner();

    // ----- Types -----
    enum Side { A, B }

    struct ArbitrationProfile {
        uint16 confidenceThresholdBps; // e.g. 8000 = 80%
        uint8  m;
        uint8  n;
        address[] arbitrators;
        mapping(address => bool) isArbitrator;
    }

    struct Wager {
        // parties & token
        address partyA;
        address partyB;
        IERC20  token;

        // required stakes & escrowed balances
        uint256 stakeARequired;
        uint256 stakeBRequired;
        uint256 stakeA;
        uint256 stakeB;

        // metadata
        string claim;
        string sources;
        bytes32 evidenceRoot;
        string  evidenceURI;

        // state
        bool fundedA;
        bool fundedB;
        bool resolved;
        address winner;
        uint96 winningConfidenceBps;

        // arbitration
        ArbitrationProfile profile;

        // votes
        mapping(address => bool) arbitratorHasVoted;
        uint256 votesForA;
        uint256 votesForB;
    }

    // keccak256("ArbitrationReceipt(uint256 wagerId,address winner,uint96 confidenceBps,string traceURI,uint256 timestamp)")
    bytes32 public constant ARBITRATION_RECEIPT_TYPEHASH =
        0x01d54b2b3eb75c8a2d98084b5503a1c3724ec1a2a82a0289781db2acb76df2c1;

    struct ArbitrationReceipt {
        uint256 wagerId;
        address winner;
        uint96  confidenceBps;
        string  traceURI;
        uint256 timestamp;
    }

    // ----- Storage -----
    uint256 public nextWagerId;
    mapping(uint256 => Wager) private _wagers;

    // ----- Events -----
    event WagerCreated(
        uint256 indexed id,
        address indexed partyA,
        address indexed partyB,
        address token,
        uint256 stakeARequired,
        uint256 stakeBRequired,
        uint16 confidenceThresholdBps,
        uint8 m,
        uint8 n
    );
    event EscrowFunded(uint256 indexed id, address indexed party, uint256 amount);
    event EvidenceAttached(uint256 indexed id, bytes32 root, string uri);
    event ReceiptAccepted(uint256 indexed id, address indexed arbitrator, address winner, uint96 confidenceBps, string traceURI);
    event Resolved(uint256 indexed id, address indexed winner, uint96 confidenceBps);
    event Payout(uint256 indexed id, address indexed winner, uint256 amount);

    constructor() EIP712("ZeroGravityJudge", "1") {}

    // ----- Create -----
    function createWager(
        address partyB,
        address token,
        uint256 stakeARequired,
        uint256 stakeBRequired,
        string memory claim,
        string memory sources,
        uint16 confidenceThresholdBps,
        uint8 m,
        address[] memory arbitrators
    ) external returns (uint256 id) {
        if (partyB == address(0) || token == address(0)) revert InvalidParams();
        if (stakeARequired == 0 || stakeBRequired == 0) revert InvalidParams();
        if (confidenceThresholdBps == 0 || confidenceThresholdBps > 10_000) revert InvalidParams();
        if (arbitrators.length == 0) revert InvalidParams();
        if (m == 0 || m > arbitrators.length) revert InvalidParams();

        id = ++nextWagerId;
        Wager storage w = _wagers[id];
        w.partyA = msg.sender;
        w.partyB = partyB;
        w.token = IERC20(token);
        w.stakeARequired = stakeARequired;
        w.stakeBRequired = stakeBRequired;
        w.claim = claim;
        w.sources = sources;
        w.profile.confidenceThresholdBps = confidenceThresholdBps;
        w.profile.m = m;
        w.profile.n = uint8(arbitrators.length);
        w.profile.arbitrators = arbitrators;
        for (uint256 i; i < arbitrators.length; i++) {
            w.profile.isArbitrator[arbitrators[i]] = true;
        }

        emit WagerCreated(
            id,
            w.partyA,
            w.partyB,
            token,
            stakeARequired,
            stakeBRequired,
            confidenceThresholdBps,
            m,
            uint8(arbitrators.length)
        );
    }

    // ----- Escrow -----
    function fundEscrow(uint256 id, Side side) external {
        Wager storage w = _wagers[id];
        if (w.partyA == address(0)) revert InvalidParams();
        if (w.resolved) revert AlreadyResolved();

        if (side == Side.A) {
            if (msg.sender != w.partyA) revert NotParty();
            if (w.fundedA) revert AlreadyFunded();
            w.token.safeTransferFrom(msg.sender, address(this), w.stakeARequired);
            w.fundedA = true;
            w.stakeA += w.stakeARequired;
            emit EscrowFunded(id, msg.sender, w.stakeARequired);
        } else {
            if (msg.sender != w.partyB) revert NotParty();
            if (w.fundedB) revert AlreadyFunded();
            w.token.safeTransferFrom(msg.sender, address(this), w.stakeBRequired);
            w.fundedB = true;
            w.stakeB += w.stakeBRequired;
            emit EscrowFunded(id, msg.sender, w.stakeBRequired);
        }
    }

    // ----- Evidence -----
    function attachEvidence(uint256 id, bytes32 root, string calldata uri) external {
        Wager storage w = _wagers[id];
        if (msg.sender != w.partyA && msg.sender != w.partyB) revert NotParty();
        w.evidenceRoot = root;
        w.evidenceURI = uri;
        emit EvidenceAttached(id, root, uri);
    }

    // ----- Receipt / Resolution -----
    function submitReceipt(ArbitrationReceipt calldata r, bytes calldata signature) external {
        Wager storage w = _wagers[r.wagerId];
        if (w.partyA == address(0)) revert InvalidParams();
        if (!w.fundedA || !w.fundedB) revert NotFunded();
        if (w.resolved) revert AlreadyResolved();

        // verify signature against typed data hash
        bytes32 digest = _hashReceiptTyped(r);
        address signer = ECDSA.recover(digest, signature);
        if (!w.profile.isArbitrator[signer]) revert NotArbitrator();
        if (w.arbitratorHasVoted[signer]) revert DuplicateReceipt();

        if (r.confidenceBps < w.profile.confidenceThresholdBps) revert ConfidenceTooLow();
        if (r.winner != w.partyA && r.winner != w.partyB) revert UnknownWinner();

        w.arbitratorHasVoted[signer] = true;

        if (r.winner == w.partyA) {
            w.votesForA += 1;
        } else {
            w.votesForB += 1;
        }
        emit ReceiptAccepted(r.wagerId, signer, r.winner, r.confidenceBps, r.traceURI);

        if (w.votesForA >= w.profile.m) {
            _finalize(r.wagerId, w.partyA, r.confidenceBps);
        } else if (w.votesForB >= w.profile.m) {
            _finalize(r.wagerId, w.partyB, r.confidenceBps);
        }
    }

    function receiptDigest(ArbitrationReceipt calldata r) external view returns (bytes32) {
        return _hashReceiptTyped(r);
    }

    function _hashReceiptTyped(ArbitrationReceipt calldata r) private view returns (bytes32) {
        // keep stack shallow by isolating hashing
        bytes32 structHash = keccak256(
            abi.encode(
                ARBITRATION_RECEIPT_TYPEHASH,
                r.wagerId,
                r.winner,
                r.confidenceBps,
                keccak256(bytes(r.traceURI)),
                r.timestamp
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function _finalize(uint256 id, address winner, uint96 confidenceBps) private {
        Wager storage w = _wagers[id];
        if (w.resolved) revert AlreadyResolved();
        w.resolved = true;
        w.winner = winner;
        w.winningConfidenceBps = confidenceBps;

        emit Resolved(id, winner, confidenceBps);

        uint256 pot = w.stakeA + w.stakeB;
        w.stakeA = 0;
        w.stakeB = 0;

        w.token.safeTransfer(winner, pot);
        emit Payout(id, winner, pot);
    }

    // ----- Lightweight getters (split to avoid via-IR stack blowups) -----

    function getWagerCore(uint256 id)
        external
        view
        returns (
            address partyA,
            address partyB,
            address token,
            uint256 stakeARequired,
            uint256 stakeBRequired,
            bool fundedA,
            bool fundedB,
            bool resolved,
            address winner,
            uint96 winningConfidenceBps
        )
    {
        Wager storage w = _wagers[id];
        partyA = w.partyA;
        partyB = w.partyB;
        token = address(w.token);
        stakeARequired = w.stakeARequired;
        stakeBRequired = w.stakeBRequired;
        fundedA = w.fundedA;
        fundedB = w.fundedB;
        resolved = w.resolved;
        winner = w.winner;
        winningConfidenceBps = w.winningConfidenceBps;
    }

    function getWagerMeta(uint256 id)
        external
        view
        returns (bytes32 evidenceRoot, string memory evidenceURI, string memory claim, string memory sources)
    {
        Wager storage w = _wagers[id];
        evidenceRoot = w.evidenceRoot;
        evidenceURI = w.evidenceURI;
        claim = w.claim;
        sources = w.sources;
    }

    function getWagerProfile(uint256 id)
        external
        view
        returns (uint16 confidenceThresholdBps, uint8 m, uint8 n, address[] memory arbitrators)
    {
        Wager storage w = _wagers[id];
        confidenceThresholdBps = w.profile.confidenceThresholdBps;
        m = w.profile.m;
        n = w.profile.n;
        arbitrators = w.profile.arbitrators;
    }

    function getWagerVotes(uint256 id) external view returns (uint256 votesForA, uint256 votesForB) {
        Wager storage w = _wagers[id];
        votesForA = w.votesForA;
        votesForB = w.votesForB;
    }
}
