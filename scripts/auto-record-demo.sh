#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

# Load bot token
source .env
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  TELEGRAM_BOT_TOKEN="$TURING_TELEGRAM_BOT_TOKEN"
fi
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ TELEGRAM_BOT_TOKEN / TURING_TELEGRAM_BOT_TOKEN not set"
  exit 1
fi

CHAT_ID="509391895"
TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 Auto-recording Turing MindGames Arena Demo"
echo "Demo ID: $DEMO_ID"
echo "Chat ID: $CHAT_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Check bot status
if ! bash scripts/public-demo-bot.sh status | grep -q "RUNNING"; then
  echo "❌ Bot not running. Start it first."
  exit 1
fi

# Helper function to send Telegram command
send_command() {
  local cmd="$1"
  echo "📤 Sending: $cmd"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$CHAT_ID" \
    -d text="$cmd" \
    > /dev/null
  sleep 2
}

# Start screen recording (macOS)
echo "📹 Starting screen recording..."
RECORDING_PID=""
if command -v screencapture &> /dev/null; then
  # macOS: use built-in screen recording via QuickTime Player automation
  osascript <<EOF > /dev/null 2>&1 &
tell application "QuickTime Player"
  activate
  delay 1
  new screen recording
  delay 2
  tell application "System Events"
    keystroke return
  end tell
end tell
EOF
  RECORDING_PID=$!
  echo "⚠️  Screen recording started via QuickTime. You'll need to manually stop it later."
  sleep 5
else
  echo "⚠️  screencapture not available. Please record manually."
fi

echo ""
echo "🎮 Step 1/4: Creating new game..."
send_command "/newgame"
sleep 3

echo ""
echo "💰 Step 2/4: Enabling demo wager mode..."
send_command "/wagerdemo"
sleep 3

echo ""
echo "👤 Step 3/4: Joining game as human..."
send_command "/join"
sleep 3

echo ""
echo "▶️  Step 4/4: Starting game..."
send_command "/startgame"

echo ""
echo "⏳ Game started! Now running automatically..."
echo "Expected duration: 8-12 minutes"
echo ""
echo "The bot will:"
echo "  - Post demo wager bonds for all 6 seats"
echo "  - Run night phases (wolf kills, seer checks)"
echo "  - Run day phases (AI agent speeches)"
echo "  - Run vote phases"
echo "  - Display final results + Mantle Sepolia transaction"
echo ""
echo "Waiting for game completion..."
echo "You can monitor progress in Telegram chat $CHAT_ID"
echo ""

# Poll bot logs for game completion marker
START_TIME=$(date +%s)
TIMEOUT=900  # 15 minutes
while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "⚠️  Timeout after ${TIMEOUT}s. Game may still be running."
    break
  fi
  
  if bash scripts/public-demo-bot.sh logs | tail -20 | grep -q "turing-telegram-game-finalized"; then
    echo "✅ Game completed!"
    sleep 5
    break
  fi
  
  echo -n "."
  sleep 10
done

echo ""
echo ""
echo "🎬 Demo recording complete!"
echo ""
echo "📦 Saving artifacts..."

# Save bot logs
bash scripts/public-demo-bot.sh logs | tail -200 > "$ARTIFACT_DIR/bot-logs.txt"

# Extract game ID and tx from logs
GAME_ID=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"gameId":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
TX_HASH=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"txHash":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo "$GAME_ID" > "$ARTIFACT_DIR/game-id.txt"
echo "$TX_HASH" > "$ARTIFACT_DIR/settlement-tx.txt"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"

mkdir -p "$ARTIFACT_DIR/screenshots"

echo ""
echo "📊 Demo Summary:"
echo "  Game ID: $GAME_ID"
echo "  Settlement TX: $TX_HASH"
echo "  Mantlescan: https://sepolia.mantlescan.xyz/tx/$TX_HASH"
echo ""
echo "📁 Artifacts saved to: $ARTIFACT_DIR"
echo ""
echo "⚠️  IMPORTANT: Stop screen recording manually if using QuickTime"
echo "Then move the recording file to: $ARTIFACT_DIR/demo-video.mov"
echo ""
echo "Next steps:"
echo "1. Stop QuickTime screen recording (Cmd+Ctrl+Esc)"
echo "2. Save recording as: $ARTIFACT_DIR/demo-video.mov"
echo "3. Optionally add Telegram screenshots to: $ARTIFACT_DIR/screenshots/"
echo ""

open "$ARTIFACT_DIR"
