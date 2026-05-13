#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 Recording Turing MindGames Arena Demo - Wagered Mode"
echo "Demo ID: $DEMO_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Check bot status
if ! bash scripts/public-demo-bot.sh status | grep -q "RUNNING"; then
  echo "❌ Bot not running. Start it first with: bash scripts/public-demo-bot.sh start"
  exit 1
fi

# Check if Telegram bot token exists
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "⚠️  TELEGRAM_BOT_TOKEN not set. Make sure bot can respond."
fi

echo "📝 Demo flow:"
echo "1. /newgame"
echo "2. /wagerdemo"
echo "3. /join"
echo "4. /startgame"
echo "5. Wait for game completion (~8-12 minutes)"
echo "6. Save artifacts"
echo ""
echo "✋ This script will guide you. Open Telegram and follow the prompts."
echo ""

read -p "Press Enter to start demo recording..." 

echo ""
echo "🎮 Step 1: Send /newgame to the bot in Telegram"
read -p "Press Enter after you sent /newgame..." 

echo ""
echo "💰 Step 2: Send /wagerdemo to enable demo-sponsored wager"
read -p "Press Enter after you sent /wagerdemo..." 

echo ""
echo "👤 Step 3: Send /join to join as human player"
read -p "Press Enter after you sent /join..." 

echo ""
echo "▶️  Step 4: Send /startgame to begin the match"
echo "The bot will now:"
echo "  - Post performance bonds for all 6 seats"
echo "  - Run night/day/vote phases automatically"
echo "  - Display AI agent speech and votes"
echo "  - Settle wager and show transaction on Mantle Sepolia"
read -p "Press Enter after you sent /startgame..." 

echo ""
echo "⏳ Waiting for game to complete..."
echo "This will take 8-12 minutes. The bot will announce when finished."
echo ""
read -p "Press Enter after the game has FINISHED and you see the final result..." 

echo ""
echo "✅ Demo recording complete!"
echo ""
echo "📦 Artifact directory: $ARTIFACT_DIR"
echo ""
echo "Next steps:"
echo "1. Copy Telegram chat screenshots to: $ARTIFACT_DIR/screenshots/"
echo "2. Save transaction hash from final message"
echo "3. Optionally: screen recording video to $ARTIFACT_DIR/demo-video.mov"
echo ""
echo "Example:"
echo "  mkdir -p $ARTIFACT_DIR/screenshots"
echo "  # paste screenshots"
echo "  echo 'TX_HASH' > $ARTIFACT_DIR/settlement-tx.txt"
echo ""

mkdir -p "$ARTIFACT_DIR/screenshots"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"

echo "Demo artifact structure created at: $ARTIFACT_DIR"
