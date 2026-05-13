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

echo "🎬 TapRecord Auto-recording Turing MindGames Arena Demo"
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

echo "📱 Activating Telegram Desktop..."
osascript << 'APPLESCRIPT'
tell application "Telegram"
  activate
  delay 1
end tell
APPLESCRIPT

sleep 2

echo "📹 Starting TapRecord..."
osascript << 'APPLESCRIPT'
tell application "TapRecord"
  activate
  delay 1
end tell

tell application "System Events"
  tell process "TapRecord"
    -- Wait for TapRecord window
    repeat until (exists window 1)
      delay 0.5
    end repeat
    -- Click record button (assuming it's the main window action)
    -- You may need to adjust this based on TapRecord UI
    keystroke "r" using {command down}
  end tell
end tell
APPLESCRIPT

echo "⏳ Waiting 5 seconds for recording to start..."
sleep 5

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
echo "⏳ Game started! Recording in progress..."
echo "Expected game duration: 8-12 minutes"
echo ""

# Poll bot logs for game completion
START_TIME=$(date +%s)
TIMEOUT=900  # 15 minutes
while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo "⚠️  Timeout after ${TIMEOUT}s."
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
echo "🛑 Stopping recording..."
osascript << 'APPLESCRIPT'
tell application "System Events"
  tell process "TapRecord"
    -- Stop recording (Cmd+R or Cmd+Shift+2 depending on TapRecord version)
    keystroke "r" using {command down}
  end tell
end tell
APPLESCRIPT

sleep 3

echo ""
echo "📦 Saving artifacts..."

# Save bot logs
bash scripts/public-demo-bot.sh logs | tail -200 > "$ARTIFACT_DIR/bot-logs.txt"

# Extract game ID and tx
GAME_ID=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"gameId":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
TX_HASH=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"txHash":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo "$GAME_ID" > "$ARTIFACT_DIR/game-id.txt"
echo "$TX_HASH" > "$ARTIFACT_DIR/settlement-tx.txt"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"

echo ""
echo "📊 Demo Summary:"
echo "  Game ID: $GAME_ID"
echo "  Settlement TX: $TX_HASH"
echo "  Mantlescan: https://sepolia.mantlescan.xyz/tx/$TX_HASH"
echo ""
echo "📁 Artifacts saved to: $ARTIFACT_DIR"
echo ""
echo "⚠️  IMPORTANT: TapRecord recording has been stopped."
echo "Please save the recording file to: $ARTIFACT_DIR/demo-video.mov"
echo ""

open "$ARTIFACT_DIR"
