#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 Semi-Auto Demo Recording"
echo "Demo ID: $DEMO_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Verify VPS bot
echo "🔍 Verifying VPS bot..."
if ! ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh status' | grep -q "RUNNING"; then
  echo "❌ VPS bot not running."
  exit 1
fi
echo "✅ VPS bot is running"
echo ""

echo "==========================================="
echo "👉 YOU DO NOW:"
echo "  1. Open TapRecord"
echo "  2. Frame the Telegram chat window"
echo "  3. Start recording in TapRecord"
echo "==========================================="
echo ""
read -p "Press Enter AFTER you started TapRecord recording..." 

echo ""
echo "📱 Activating Telegram..."
osascript << 'APPLESCRIPT'
tell application "Telegram"
  activate
  delay 1
end tell
APPLESCRIPT

sleep 2

echo ""
echo "🎮 Sending game commands automatically..."

# Send commands via Telegram Desktop UI
send_telegram_command() {
  local cmd="$1"
  echo "  📤 $cmd"
  osascript << APPLESCRIPT
tell application "System Events"
  tell process "Telegram"
    keystroke "$cmd"
    delay 0.3
    keystroke return
    delay 2
  end tell
end tell
APPLESCRIPT
  sleep 2
}

send_telegram_command "/newgame"
send_telegram_command "/wagerdemo"
send_telegram_command "/join"
send_telegram_command "/startgame"

echo ""
echo "⏳ Game started! Monitoring for completion (8-12 min)..."
echo ""

# Monitor VPS bot logs
START_TIME=$(date +%s)
TIMEOUT=900
LAST_CHECK=$(date +%s)

while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo ""
    echo "⚠️  Timeout"
    break
  fi
  
  if [ $(($(date +%s) - LAST_CHECK)) -ge 10 ]; then
    if ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh logs | tail -30' | grep -q "turing-telegram-game-finalized"; then
      echo ""
      echo "✅ Game completed!"
      sleep 5
      break
    fi
    echo -n "."
    LAST_CHECK=$(date +%s)
  fi
  sleep 2
done

echo ""
echo ""
echo "==========================================="
echo "👉 YOU DO NOW:"
echo "  Stop TapRecord recording and save video"
echo "==========================================="
echo ""
read -p "Press Enter AFTER you saved the video..." 

echo ""
echo "📦 Collecting artifacts..."

ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh logs | tail -300' > "$ARTIFACT_DIR/bot-logs.txt"

GAME_ID=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"gameId":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
TX_HASH=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"txHash":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
ACTION_REGISTRY=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"actionRegistryAddress":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo "$GAME_ID" > "$ARTIFACT_DIR/game-id.txt"
echo "$TX_HASH" > "$ARTIFACT_DIR/settlement-tx.txt"
echo "$ACTION_REGISTRY" > "$ARTIFACT_DIR/action-registry.txt"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"
mkdir -p "$ARTIFACT_DIR/screenshots"

echo ""
echo "📊 Demo Summary:"
echo "  Game ID: $GAME_ID"
echo "  TX: $TX_HASH"
echo "  Registry: $ACTION_REGISTRY"
echo "  Mantlescan: https://sepolia.mantlescan.xyz/tx/$TX_HASH"
echo ""
echo "📁 Artifacts: $ARTIFACT_DIR"
echo ""
echo "📋 Move your video to: $ARTIFACT_DIR/demo-video.mov"
echo ""

open "$ARTIFACT_DIR"
