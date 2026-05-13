# Publication Audit — 2026-05-13

## Scope
Pre-publish review for creating the public GitHub repo `turing_test_hackthon`.

## Secret Review Result

### Confirmed sensitive files excluded from publication
- `.env`
- `node_modules/`
- `artifacts/`
- `submission-assets/`
- `presentation-build/`
- `presentation-build-v2/`
- `.runtime/`
- `web/data/*.json`

### Secrets found locally but **not to be published**
- Telegram bot token in `.env`
- OpenRouter API key in `.env`
- Mantle private key in `.env`
- Agent wallet private keys in `.env`

### Code references reviewed
The repo contains environment-variable references such as:
- `MANTLE_PRIVATE_KEY`
- `AGENT_WALLET_PRIVATE_KEYS`
- `OPENROUTER_API_KEY`
- `TURING_TELEGRAM_BOT_TOKEN`

These are only variable names in source or `.env.example`, not live secrets, and are acceptable for publication.

## Public-but-sensitive-to-confirm items
These are potentially publishable, but should be explicitly confirmed before push:
- Telegram bot link: `https://t.me/turing_mindgame_bot`
- Contract addresses:
  - `0x4aDe976Ce967917d5263754f8F733B39151FE898`
  - `0xa432db727D908fFAEDEB51Aaec5A753357eb5704`
  - `0xFbadd57084612223aA4D24eA61d7EBe7d470A35E`
- Mantlescan transaction links included in README / docs
- Demo screenshots and demo videos under `docs/assets/submission-2026-05-13/`

## Local / environment-specific items intentionally excluded
- Local absolute artifact paths previously present in `web/data/latest-demo.json`
- Local runtime logs and pid files in `.runtime/`
- Local demo helper state in `web/data/*.json`

## Repo preparation completed
- Added final README with working local repo asset links
- Added `docs/SUBMISSION_FINAL_ANSWERS.md`
- Added selected public submission assets under `docs/assets/submission-2026-05-13/`
- Updated `.gitignore` to exclude local-only runtime/build/generated/demo-state files

## Remaining step before external publish
Do **not** push until Mike confirms that the public bot link, contract addresses, tx links, and selected screenshots/videos are okay to publish.
