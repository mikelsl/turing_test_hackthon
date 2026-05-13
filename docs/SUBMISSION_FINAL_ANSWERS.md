# Mantle Turing Test Hackathon — Final Submission Answers

## Project Name

Turing MindGames Arena

## One-line Pitch

A stake-backed AI social reasoning benchmark where humans and autonomous agents play deduction games on Mantle with transparent on-chain action records and automated settlement.

## Problem

Most AI demos focus on chat, coding, or narrow tool use. They rarely test the social reasoning that matters in real multi-agent environments: persuasion, deception resistance, trust calibration, coalition-building, and strategic adaptation under uncertainty.

## Solution

Turing MindGames Arena turns social deduction gameplay into a benchmark and agent economy on Mantle. In the current MVP, one human and multiple AI agents play Werewolf through a Telegram bot. Mantle smart contracts provide the economic and transparency layer: MNT performance bonds, an on-chain action registry, automated settlement, and a claim flow for winners.

## Why Mantle

- **Performance bonds in MNT:** creates real economic incentives for participation
- **On-chain action audit:** key AI actions are recorded through `AgentActionRegistry`
- **Automated settlement:** `GameSettlementVault` handles prize distribution and claiming
- **Future agent economy path:** strong foundation for agent identity, reputation, and transparent execution

## What Works Today

- human + AI Werewolf MVP
- Telegram-native gameplay through `@turing_mindgame_bot`
- GLM-powered AI agents
- demo-sponsored wager flow
- self-wallet wager flow with MetaMask deposit / claim pages
- verified Mantle Sepolia contracts
- real end-to-end wagered game evidence on-chain
- presentation video and recorded gameplay demo

## Demo Flow

1. Open the Telegram bot
2. Start a room with `/newgame`
3. Choose `/wagerdemo` or `/wagerself`
4. Join the game and start it
5. AI agents play automatically through day / night cycles
6. The result is posted back to Telegram
7. Settlement is executed on Mantle
8. Winners can claim rewards

## Differentiators

- social reasoning benchmark instead of generic chat demo
- consumer-friendly Telegram UX instead of dev-only tooling
- performance bonds create real stakes and incentives
- on-chain action transparency instead of opaque AI behavior
- strong expansion path toward agent reputation, tournaments, and richer social games

## Live Links

- **Telegram bot:** https://t.me/turing_mindgame_bot
- **Full submission demo (2m29s):** https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/Turing-MindGames-Arena-Submission-Full-Demo.mp4
- **Presentation video:** https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/Turing-MindGames-Arena-Presentation-v2.mp4
- **Recorded gameplay demo:** https://github.com/mikelsl/turing_test_hackthon/raw/main/docs/assets/submission-2026-05-13/demo-video-wagerdemo-2026-05-13.mp4

## Proof Points

- **AgentRegistry:** `0x4aDe976Ce967917d5263754f8F733B39151FE898`
- **AgentActionRegistry:** `0xa432db727D908fFAEDEB51Aaec5A753357eb5704`
- **GameSettlementVault:** `0xFbadd57084612223aA4D24eA61d7EBe7d470A35E`
- **Mantle Sepolia settlement tx:** https://sepolia.mantlescan.xyz/tx/0xa3b6ab879720085919fd924ea9f989ec995cc77b702ad54cca87e9e926600634
- **Live wagered game:** `wager-live-1778650998190`

## Why It Matters Beyond Games

Werewolf is the first interface, not the whole product. The broader direction is a social intelligence layer for autonomous agents: benchmark environments for multi-agent reasoning, transparent action histories, persistent reputation, and future tournament or governance scenarios where social reasoning matters.

## Scope Note

This submission focuses on socially grounded AI evaluation plus Mantle-native incentives and transparency. The performance bond and settlement system is important, but the larger product value is a reusable benchmark and agent economy for reasoning under uncertainty.

## Publication Safety

Before any public repo update or external submission package, run a strict secret review. Do not publish private keys, API keys, `.env`, `secrets/`, bearer tokens, local credential paths, or unredacted logs/screenshots. Confirm public bot links, wallet addresses, contract addresses, explorer links, and tx hashes before publication.
