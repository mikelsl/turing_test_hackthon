# DoraHacks Submission Draft — Turing MindGames Arena

This draft is based on the live public DoraHacks pages for **The Turing Test Hackathon 2026**:
- Tracks: `https://dorahacks.io/hackathon/mantleturingtesthackathon2026/tracks`
- Requirements & Criteria: `https://dorahacks.io/hackathon/mantleturingtesthackathon2026/requirements-&-criteria`

## Recommended Submission Positioning

### Primary Track
**Consumer & Viral DApps**

Why:
- The product is a consumer-facing Telegram-native experience, not a developer-only tool.
- Gameplay is inherently social, shareable, and easy to demo.
- The project has a strong interactive loop and clear public-facing UX.

### Secondary Positioning in Description
Also emphasize:
- **AI DevTools** angle: a benchmark environment for AI social reasoning
- **Deployment Award** eligibility: deployed, verified, public demo, open-source repo, AI-powered on-chain function, 2+ minute demo video
- **Best UI/UX Award** eligibility: Telegram-first onboarding plus self-wallet deposit flow

### Do **not** primarily position as
- **Agentic Wallets & Economy** unless the actual form allows multi-track mention without strict Byreal capability requirements
- **AI x RWA**
- **AI Trading & Strategy**

---

## Paste-Ready Fields

### Project Name
Turing MindGames Arena

### One-line Pitch / Tagline
A stake-backed AI social reasoning benchmark on Mantle where humans and autonomous agents play deduction games with transparent on-chain action records and automated settlement.

### Short Description
Turing MindGames Arena is a Mantle-native Telegram game platform where one human and multiple AI agents compete in social deduction gameplay with MNT performance bonds, verifiable on-chain action logs, and automated winner settlement.

### Full Description
Turing MindGames Arena is a social reasoning benchmark and agent economy built on Mantle.

Most AI benchmarks test isolated skills like math, coding, or single-turn Q&A. But real autonomous agents must also reason socially: they need to persuade, detect deception, adapt to incomplete information, and coordinate with or against other agents in multi-party environments.

We built Turing MindGames Arena to test exactly that.

Our first playable environment is Werewolf, a hidden-role social deduction game played through a Telegram bot. One human player and multiple AI agents participate in day and night cycles, private role constraints, public discussion, voting, and elimination. Wolves must lie convincingly. Villagers must infer hidden roles. Every participant must make strategic decisions under uncertainty.

What makes this Mantle-native is the economic and transparency layer:
- Players can enter games with performance bonds in MNT
- Smart contracts handle prize pool settlement automatically
- Key AI actions are recorded on-chain through an action registry
- Users can either use a frictionless demo-sponsored mode or participate from their own wallet with MetaMask

This turns gameplay into a verifiable benchmark for AI social reasoning, while also creating the foundation for a future agent economy with reputation, incentives, and transparent execution.

The current MVP includes:
- a Telegram bot gameplay interface
- GLM-powered AI agents
- Mantle Sepolia smart contracts for registry, action audit, and settlement
- demo wager mode for easy testing
- self-wallet deposit and claim flows
- real end-to-end wagered game evidence on-chain

In short, Turing MindGames Arena is not just a game. It is a consumer-friendly, stake-backed, transparent environment for evaluating autonomous agents on Mantle.

### Problem
Most AI demos focus on chat, coding, or tool use, but they do not test the social reasoning needed in real multi-agent environments: persuasion, deception resistance, trust calibration, coalition-building, and strategic adaptation under uncertainty.

### Solution
We built a Telegram-native game arena where AI agents and humans interact in social deduction games, while Mantle smart contracts provide transparent action records, performance-bond settlement, and verifiable outcomes.

### Why Mantle
Mantle is a strong fit because the product needs:
- low-cost on-chain writes for transparent action records
- native token-based performance bonds and payout settlement
- a credible ecosystem for agent identity, incentives, and on-chain execution

Mantle is not just the hosting chain. It is part of the product logic:
- MNT is used for bonds and rewards
- smart contracts enforce settlement
- on-chain records make agent behavior auditable
- the system can evolve into a broader Mantle-native agent reputation and coordination layer

### Core Features
- Telegram-first consumer UX
- AI social deduction gameplay
- GLM-based agent reasoning
- performance bonds in MNT
- on-chain action registry
- automated settlement for winners
- demo mode and self-wallet mode
- real Mantle Sepolia deployment and transaction evidence

### Why This Fits Consumer & Viral DApps
Turing MindGames Arena is easy to try, visually clear, conversational, and inherently shareable. A user can enter through Telegram, play a social reasoning game, watch AI agents argue in public, and verify the outcome on-chain. That makes it a much more accessible consumer experience than a typical DeFi or devtool demo.

---

## Submission Links

### GitHub Repo
https://github.com/mikelsl/turing_test_hackthon

### Telegram Bot
https://t.me/turing_mindgame_bot

### Demo Video (recommended main submission video, 2m29s)
https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/Turing-MindGames-Arena-Submission-Full-Demo.mp4

### Presentation Video
https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/Turing-MindGames-Arena-Presentation-v2.mp4

### Raw Gameplay Demo
https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/demo-video-wagerdemo-2026-05-13.mp4

### Key Screenshots
- https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/telegram-newgame.png
- https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/preparing-bonds.png
- https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/game-results.png
- https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/settlement.png

---

## Contract / Deployment Section

### Network
Mantle Sepolia Testnet

### Contract Addresses
- AgentRegistry: `0x4aDe976Ce967917d5263754f8F733B39151FE898`
- AgentActionRegistry: `0xa432db727D908fFAEDEB51Aaec5A753357eb5704`
- GameSettlementVault: `0xFbadd57084612223aA4D24eA61d7EBe7d470A35E`

### Explorer Links
- AgentRegistry: https://sepolia.mantlescan.xyz/address/0x4aDe976Ce967917d5263754f8F733B39151FE898
- AgentActionRegistry: https://sepolia.mantlescan.xyz/address/0xa432db727D908fFAEDEB51Aaec5A753357eb5704
- GameSettlementVault: https://sepolia.mantlescan.xyz/address/0xFbadd57084612223aA4D24eA61d7EBe7d470A35E

### Proof Transaction
Settlement tx:
https://sepolia.mantlescan.xyz/tx/0xa3b6ab879720085919fd924ea9f989ec995cc77b702ad54cca87e9e926600634

### Live Game Evidence
- Live wagered game ID: `wager-live-1778650998190`
- Total pool: `0.006 MNT`
- Winner side: `wolves`

---

## If the Form Asks About AI / On-chain Functionality

### What AI does in your project
AI agents generate role-aware speech, vote decisions, and night actions in a multi-turn hidden-role environment. The system uses GLM through OpenRouter for strategic natural-language gameplay.

### What on-chain function is AI-powered
The project writes AI-driven game actions and finalized outcomes to Mantle through `AgentActionRegistry`, and settles performance-bond outcomes through `GameSettlementVault` based on gameplay results generated by the AI-driven match.

### What is verifiable on-chain
- deployed contract addresses
- action registry writes
- game finalization records
- winner settlement transaction
- claim flow for winners

---

## If the Form Asks About Technical Architecture

Turing MindGames Arena has four main layers:

1. **User Interface**
   - Telegram bot for gameplay
   - web deposit and claim pages for self-wallet mode

2. **Game Engine**
   - TypeScript runtime for Werewolf
   - role assignment, day/night flow, speech, voting, elimination, and win conditions

3. **AI Layer**
   - GLM-powered agents through OpenRouter
   - role-aware prompting for speech, voting, and actions

4. **On-chain Layer**
   - `AgentRegistry`
   - `AgentActionRegistry`
   - `GameSettlementVault`

---

## If the Form Asks About Innovation

Our core innovation is combining three things that are usually separate:
1. social reasoning evaluation
2. consumer-facing agent interaction
3. on-chain transparency and economic incentives

Instead of benchmarking AI in isolated prompts, we benchmark agents in adversarial, multi-party, strategic environments. Instead of keeping those decisions opaque, we record key actions on-chain. Instead of making it purely academic, we add performance bonds and settlement so participation has economic meaning.

---

## If the Form Asks About Mantle Ecosystem Contribution

This project contributes to Mantle by:
- creating a consumer-facing AI application native to Mantle
- using MNT as a performance-bond and reward primitive
- demonstrating transparent on-chain action logging for AI systems
- building a foundation for future agent reputation and coordination on Mantle
- bringing non-technical users into the ecosystem through Telegram-native onboarding

---

## If the Form Asks About Future Roadmap

Near term:
- improve the public replay/dashboard experience
- add richer action timelines and analytics
- expand self-wallet onboarding
- improve mobile-friendly viewing and sharing

Mid term:
- add more social reasoning game formats like Avalon and negotiation scenarios
- add agent reputation and historical performance profiles
- support tournaments and challenge rooms

Long term:
- become a reusable on-chain benchmark and coordination layer for autonomous agents on Mantle

---

## Suggested Awards / Positioning

### Main track selection
**Consumer & Viral DApps**

### Mention as additional fit in description
- Best UI/UX Award
- 20 Project Deployment Award
- Grand Champion candidate through AI + on-chain + product completeness

---

## Small but Important Notes

1. Use the **full submission demo** as the main demo video because it is **2m29s** and clears the Deployment Award video-length requirement.
2. Keep the **presentation video** and **raw gameplay demo** as supporting links, not the primary required demo video.
3. If the form has a short “one-line pitch” field and a longer “description” field, use the short pitch above exactly and paste the full description into the long field.
4. If the form asks for only one track, choose **Consumer & Viral DApps**.
