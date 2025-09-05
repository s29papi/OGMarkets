# 🎵 0G Music Prediction Market

> A decentralized peer-to-peer prediction market for music chart outcomes, powered by the 0G ecosystem

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.19+-red.svg)](https://soliditylang.org/)

## 🎯 What It Does

The **0G Music Prediction Market** enables fans and traders to wager on measurable music outcomes — whether a song breaks into the Spotify Top 50, how high it ranks on global charts, or when it achieves streaming milestones. 

Unlike traditional betting platforms:
- **Trustless**: Chart data is cryptographically verified and stored on-chain
- **Transparent**: All evidence is publicly auditable via 0G Storage
- **Decentralized**: No intermediaries control outcomes or hold funds
- **Global**: Anyone can participate, create markets, or provide evidence

## 🔧 The Problem We Solve

Music charts drive the industry, but predicting outcomes relies on:
- **Centralized betting platforms** that can manipulate odds
- **Unverifiable data sources** prone to manipulation
- **Geographic restrictions** limiting global participation
- **Opaque resolution** where users must trust the platform

Our solution provides:
- ✅ **Trust**: Chart data is scraped, hashed, and anchored on-chain
- ✅ **Transparency**: Every prediction resolves with verifiable evidence
- ✅ **Access**: Global, permissionless participation
- ✅ **Fairness**: Multi-source verification prevents single points of failure

## 🏗️ Architecture Overview

```mermaid
graph TB
    User[User/Trader] --> API[API Layer]
    API --> SC[Smart Contracts]
    API --> Scrapers[Chart Scrapers]
    
    Scrapers --> |Spotify API| Spotify[Spotify Charts]
    Scrapers --> |Web Scraping| Kworb[Kworb Data]
    Scrapers --> Storage[0G Storage]
    
    Storage --> |Evidence Hash| Compute[0G Compute]
    Compute --> |Arbitration Result| SC
    SC --> |Payout| User
    
    style Storage fill:#f9f,stroke:#333,stroke-width:4px
    style Compute fill:#bbf,stroke:#333,stroke-width:4px
    style SC fill:#bfb,stroke:#333,stroke-width:4px
```

## 🚀 Key Features

### Music-Specific Rule Engine
- **Chart Position Predictions**: "Song X will enter Top 50 by Date Y"
- **Streaming Milestones**: "Track will reach 100M streams"
- **Viral Predictions**: "Song will trend on TikTok"
- **Multi-Platform**: Spotify, Apple Music, Billboard, YouTube

### Evidence Collection Pipeline
- **Automated Scrapers**: Continuous chart monitoring
- **Multi-Source Verification**: Cross-check Spotify with Kworb
- **Tamper-Proof Storage**: Evidence anchored in 0G Storage
- **Historical Snapshots**: Time-series data for trend analysis

### Smart Contract Integration
- **Escrow Management**: Secure fund locking until resolution
- **Threshold Resolution**: Auto-payout when confidence ≥ 85%
- **Dispute Mechanism**: M-of-N provider consensus
- **EIP-712 Signatures**: Cryptographic proof of arbitration

### Arbitration Engine
- **0G Compute Jobs**: Decentralized outcome determination
- **Confidence Scoring**: Weight official sources higher
- **Conflict Resolution**: Handle source discrepancies
- **Signed Receipts**: On-chain proof of decision

## 📁 Project Structure

```
arbitration-architecture/
├── src/
│   ├── api/                    # REST API endpoints
│   │   ├── routes/
│   │   │   ├── music.ts       # Music-specific endpoints
│   │   │   ├── wagers.ts      # Wager lifecycle management
│   │   │   └── health.ts      # System monitoring
│   │   └── server.ts           # Express server setup
│   │
│   ├── core/
│   │   ├── rules/              # Arbitration rule engines
│   │   │   ├── music.ts       # Music chart rules
│   │   │   ├── sports.ts      # Sports outcome rules
│   │   │   └── prediction.ts  # General prediction rules
│   │   └── services.ts         # Service orchestration
│   │
│   ├── scrapers/
│   │   └── chartScrapers.ts   # Spotify/Kworb scrapers
│   │
│   ├── integrations/
│   │   ├── storage.ts         # 0G Storage integration
│   │   ├── compute.ts         # 0G Compute integration
│   │   └── chain.ts           # 0G Chain interaction
│   │
│   ├── contracts/
│   │   ├── judge.ts           # Contract interfaces
│   │   └── abi/               # Contract ABIs
│   │
│   └── types/                 # TypeScript definitions
│
├── smart-contracts/            # Solidity contracts
│   ├── src/
│   │   └── PredictionMarket.sol
│   └── test/
│
└── docs/                       # Documentation
```

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | 0G Chain | Escrow, proofs, settlement |
| **Storage** | 0G Storage | Evidence anchoring |
| **Compute** | 0G Compute | Arbitration jobs |
| **Smart Contracts** | Solidity 0.8.19 | Wager logic |
| **Backend** | TypeScript/Node.js | API & scrapers |
| **Frontend** | Next.js | User interface |
| **Database** | PostgreSQL | Metadata cache |
| **Scraping** | Puppeteer/Playwright | Chart data collection |

## 📊 API Endpoints

### Music Services
```bash
# Scrape latest charts
POST /api/music/scrape
{
  "sources": ["spotify", "kworb"],
  "store": true
}

# Get chart snapshot
GET /api/music/charts/spotify?chartType=global

# Verify music claim
POST /api/music/verify
{
  "claim": {
    "trackName": "Flowers",
    "artistName": "Miley Cyrus",
    "position": 10,
    "chartType": "global"
  },
  "evidenceHashes": ["QmX..."]
}

# Create music wager
POST /api/music/wager/create
{
  "trackName": "Song Name",
  "artistName": "Artist",
  "targetPosition": 50,
  "deadline": "2024-12-31",
  "amount": "0.1"
}
```

### Wager Lifecycle
```bash
# Create wager
POST /api/wager/create

# Deposit escrow
POST /api/wager/escrow

# Trigger resolution
POST /api/wager/resolve

# Get receipt
GET /api/wager/receipt/:id

# Open dispute
POST /api/wager/dispute/:id
```

### Evidence Management
```bash
# Upload evidence
POST /api/evidence/upload

# Get evidence info
GET /api/evidence/info/:hash

# Attach to wager
POST /api/wager/:id/evidence
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- TypeScript 4.9+
- 0G Chain RPC access
- 0G Storage node access

### Installation

```bash
# Clone repository
git clone https://github.com/s29papi/0gbets.git
cd 0gbets/arbitration-architecture

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Configuration

```env
# 0G Chain Configuration
CHAIN_RPC_URL=https://rpc.0g.network
PRIVATE_KEY=your-private-key
JUDGE_CONTRACT_ADDRESS=0x...

# 0G Storage
STORAGE_INDEXER_RPC=https://storage.0g.network

# 0G Compute
COMPUTE_PROVIDER_LLAMA=0x...
COMPUTE_PROVIDER_DEEPSEEK=0x...

# API Configuration
PORT=3000
CORS_ORIGIN=*

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/musicmarket

# Scraping
SPOTIFY_CLIENT_ID=your-spotify-client
SPOTIFY_CLIENT_SECRET=your-spotify-secret
```

## 🎮 Usage Example

### 1. Create a Music Prediction

```typescript
// Create a wager that "Flowers" will enter Top 10
const wager = await createMusicWager({
  trackName: "Flowers",
  artistName: "Miley Cyrus",
  targetPosition: 10,
  chartType: "global",
  platform: "spotify",
  deadline: "2024-01-31",
  amount: ethers.parseEther("0.1")
});
```

### 2. Monitor Chart Position

```typescript
// Automated scraping job
const evidence = await collectChartEvidence(["spotify", "kworb"]);
const hash = await storeChartEvidence(storage, evidence);
```

### 3. Resolve Prediction

```typescript
// Run arbitration when deadline reached
const result = await runArbitration({
  wagerId: wager.id,
  evidenceHashes: [hash],
  profile: "music-spotify-global"
});

// Result includes winner, confidence, and proof
console.log(result);
// {
//   winner: "A",
//   confidence: 92,
//   reasoning: "Track reached position #3",
//   sources: ["spotify.com", "kworb.net"]
// }
```

## 🎯 Challenges We Solved

### Technical Challenges
- **Reliable Scraping**: Built fault-tolerant scrapers with retry logic
- **Source Conflicts**: Weighted consensus algorithm for divergent data
- **Async Updates**: Handled chart update delays between platforms
- **Storage Efficiency**: Compressed evidence with merkle proofs

### Design Challenges
- **Fair Resolution**: Multi-provider verification prevents manipulation
- **Dispute Handling**: Escalation path with higher thresholds
- **Global Access**: IPFS/0G Storage for censorship resistance
- **User Trust**: Transparent evidence trails with public verification

## 📈 What We Learned

1. **Chart Dynamics**: Music charts update asynchronously — arbitration must account for time zones and update schedules
2. **Source Authority**: Official APIs (Spotify) should weight higher than aggregators (Kworb)
3. **Fan Engagement**: Users want more than betting — they want to debate and share predictions
4. **Evidence Trails**: Transparent proof chains increase user confidence
5. **Modular Design**: Easy to add new platforms (TikTok, YouTube) without refactoring

## 🔮 Future Enhancements

- [ ] **More Platforms**: TikTok viral charts, YouTube trending
- [ ] **Live Streaming**: Real-time chart position updates
- [ ] **Social Features**: Leaderboards, prediction sharing
- [ ] **Advanced Markets**: Artist vs. Artist, genre dominance
- [ ] **ML Predictions**: AI-powered outcome probability
- [ ] **Mobile App**: Native iOS/Android experience
- [ ] **DAO Governance**: Community-driven rule changes

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Fork the repo
# Create your feature branch
git checkout -b feature/amazing-feature

# Commit your changes
git commit -m 'Add amazing feature'

# Push to the branch
git push origin feature/amazing-feature

# Open a Pull Request
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **0G Labs** for the incredible infrastructure
- **Spotify** for public chart APIs
- **Kworb** for aggregated chart data
- **OpenZeppelin** for secure contract patterns
- The **Web3 Music** community for inspiration

## 📞 Contact

- **GitHub**: [@s29papi](https://github.com/s29papi)
- **Demo**: [v0.app/chat/music-prediction-market](https://v0.app/chat/music-prediction-market-mAzVxa8aDpO)
- **Email**: team@0gmusicmarket.xyz

---

Built with ❤️ for the 0G Hackathon | Empowering Music Fans Worldwide