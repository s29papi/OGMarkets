// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ZeroGravityJudge} from "../src/ZeroGravityJudge.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// Simple mock token for testing
contract MockToken is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 10_000 ether);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ZeroGravityJudgeTest is Test {
    ZeroGravityJudge judge;
    IERC20 token;

    address partyA = address(0xA11CE);
    address partyB = address(0xB0B);

    // Arbitrators (EOAs in tests)
    address arb1 = address(0xA1);
    address arb2 = address(0xA2);
    address arb3 = address(0xA3);

    function setUp() public {
        // Deploy a mock token for testing
        MockToken mockToken = new MockToken();
        token = IERC20(address(mockToken));
        
        judge = new ZeroGravityJudge();

        // Give ERC20 balances to parties
        mockToken.mint(partyA, 1_000 ether);
        mockToken.mint(partyB, 1_000 ether);

        // Approvals for the judge to pull stakes
        vm.startPrank(partyA);
        token.approve(address(judge), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(partyB);
        token.approve(address(judge), type(uint256).max);
        vm.stopPrank();
    }

    // ---------- helpers ----------

    function _createWager(
        uint16 confidenceBps,
        uint8 m,
        address[] memory arbs
    ) internal returns (uint256 id) {
        vm.startPrank(partyA);
        id = judge.createWager(
            partyB,
            address(token),
            100 ether,
            100 ether,
            "Who wins?",
            "source:data",
            confidenceBps,
            m,
            arbs
        );
        vm.stopPrank();
    }

    function _fundBoth(uint256 id) internal {
        vm.prank(partyA);
        judge.fundEscrow(id, ZeroGravityJudge.Side.A);

        vm.prank(partyB);
        judge.fundEscrow(id, ZeroGravityJudge.Side.B);
    }

    function _oneArb() internal view returns (address[] memory a) {
        a = new address[](1);
        a[0] = arb1;
    }

    function _threeArbs() internal view returns (address[] memory a) {
        a = new address[](3);
        a[0] = arb1;
        a[1] = arb2;
        a[2] = arb3;
    }

    // ---------- tests ----------

    function test_CreateAndFundWager_Succeeds() public {
        address[] memory arbs = _oneArb();

        uint256 id = _createWager(8000, 1, arbs);
        _fundBoth(id);

        (
            address a,
            address b,
            address tkn,
            uint256 stakeARequired,
            uint256 stakeBRequired,
            bool fundedA,
            bool fundedB,
            bool resolved,
            ,
            uint96 conf
        ) = judge.getWagerCore(id);

        assertEq(a, partyA);
        assertEq(b, partyB);
        assertEq(tkn, address(token));
        assertEq(stakeARequired, 100 ether);
        assertEq(stakeBRequired, 100 ether);
        assertTrue(fundedA);
        assertTrue(fundedB);
        assertFalse(resolved);
        assertEq(conf, 0);
    }

    function test_AttachEvidence_OnlyParties() public {
        address[] memory arbs = _oneArb();
        uint256 id = _createWager(8000, 1, arbs);

        // partyA attaches
        vm.prank(partyA);
        judge.attachEvidence(id, keccak256("rootA"), "ipfs://a");

        (bytes32 rootA, string memory uriA, , ) = judge.getWagerMeta(id);
        assertEq(rootA, keccak256("rootA"));
        assertEq(uriA, "ipfs://a");

        // non-party cannot attach
        vm.expectRevert(ZeroGravityJudge.NotParty.selector);
        vm.prank(address(0xDEAD));
        judge.attachEvidence(id, keccak256("rootB"), "ipfs://b");
    }

    function test_CreateWager_InvalidParams_Reverts() public {
        address[] memory arbs = _oneArb();

        // zero stake
        vm.startPrank(partyA);
        vm.expectRevert(ZeroGravityJudge.InvalidParams.selector);
        judge.createWager(partyB, address(token), 0, 100 ether, "x", "y", 8000, 1, arbs);

        // zero/confidence out of range
        vm.expectRevert(ZeroGravityJudge.InvalidParams.selector);
        judge.createWager(partyB, address(token), 100 ether, 100 ether, "x", "y", 0, 1, arbs);

        // m > n
        address[] memory three = _threeArbs();
        vm.expectRevert(ZeroGravityJudge.InvalidParams.selector);
        judge.createWager(partyB, address(token), 100 ether, 100 ether, "x", "y", 8000, 4, three);
        vm.stopPrank();
    }

    function test_FundTwice_Reverts() public {
        address[] memory arbs = _oneArb();

        uint256 id = _createWager(8000, 1, arbs);

        vm.prank(partyA);
        judge.fundEscrow(id, ZeroGravityJudge.Side.A);

        vm.expectRevert(ZeroGravityJudge.AlreadyFunded.selector);
        vm.prank(partyA);
        judge.fundEscrow(id, ZeroGravityJudge.Side.A);
    }

    function test_FundByWrongParty_Reverts() public {
        address[] memory arbs = _oneArb();

        uint256 id = _createWager(8000, 1, arbs);

        vm.expectRevert(ZeroGravityJudge.NotParty.selector);
        vm.prank(partyB);
        judge.fundEscrow(id, ZeroGravityJudge.Side.A);

        vm.expectRevert(ZeroGravityJudge.NotParty.selector);
        vm.prank(partyA);
        judge.fundEscrow(id, ZeroGravityJudge.Side.B);
    }

    // NOTE: EIP-712 signature flow for submitReceipt() can be added once you wire signers for arbiters.
    // For now, basic creation/funding/evidence paths are validated without importing deprecated OZ presets.
}