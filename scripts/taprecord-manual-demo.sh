#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 TapRecord Demo Recording (Manual Commands)"
echo "Demo ID: $DEMO_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Check bot status
if ! bash scripts/public-demo-bot.sh status | grep -q "RUNNING"; then
  echo "❌ Bot not running. Start it first."
  exit 1
fi

echo "📱 Activating Telegram Desktop..."
osascript << 'APPLESCRIPT'
tell application "Telegram"
  activate
  delay 1
end tell
APPLESCRIPT

sleep 2

echo "📹 Starting TapRecord recording..."
echo "   (You'll need to manually start recording in TapRecord)"
osascript << 'APPLESCRIPT'
tell application "TapRecord"
  activate
  delay 1
end tell
APPLESCRIPT

sleep 3

echo ""
echo "========================================="
echo "👉 NOW: Manually start TapRecord recording"
echo "👉 THEN: In Telegram, send these commands:"
echo ""
echo "  /newgame"
echo "  /wagerdemo"
echo "  /join"
echo "  /startgame"
echo ""
echo "========================================="
echo ""
read -p "Press Enter AFTER you have started recording and sent /startgame..." 

echo ""
echo "⏳ Monitoring game progress..."
echo "Waiting for game completion (max 15 minutes)..."
echo ""

# Poll bot logs for game completion
START_TIME=$(date +%s)
TIMEOUT=900  # 15 minutes
LAST_DOT_TIME=$START_TIME

while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo ""
    echo "⚠️  Timeout after ${TIMEOUT}s."
    break
  fi
  
  if bash scripts/public-demo-bot.sh logs | tail -30 | grep -q "turing-telegram-game-finalized"; then
    echo ""
    echo "✅ Game completed!"
    sleep 5
    break
  fi
  
  # Print dot every 10 seconds
  if [ $(($(date +%s) - LAST_DOT_TIME)) -ge 10 ]; then
    echo -n "."
    LAST_DOT_TIME=$(date +%s)
  fi
  sleep 2
done

echo ""
echo ""
echo "🛑 Game finished! You can stop TapRecord recording now."
echo ""
read -p "Press Enter AFTER you have stopped recording and saved the video..." 

echo ""
echo "📦 Saving artifacts..."

# Save bot logs
bash scripts/public-demo-bot.sh logs | tail -300 > "$ARTIFACT_DIR/bot-logs.txt"

# Extract game ID and tx
GAME_ID=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"gameId":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
TX_HASH=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"txHash":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
ACTION_REGISTRY=$(bash scripts/public-demo-bot.sh logs | grep "turing-telegram-game-finalized" | tail -1 | grep -o '"actionRegistryAddress":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo "$GAME_ID" > "$ARTIFACT_DIR/game-id.txt"
echo "$TX_HASH" > "$ARTIFACT_DIR/settlement-tx.txt"
echo "$ACTION_REGISTRY" > "$ARTIFACT_DIR/action-registry.txt"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"

mkdir -p "$ARTIFACT_DIR/screenshots"

echo ""
echo "📊 Demo Summary:"
echo "  Game ID: $GAME_ID"
echo "  Settlement TX: $TX_HASH"
echo "  Action Registry: $ACTION_REGISTRY"
echo "  Mantlescan Settlement: https://sepolia.mantlescan.xyz/tx/$TX_HASH"
echo "  Mantlescan Registry: https://sepolia.mantlescan.xyz/address/$ACTION_REGISTRY"
echo ""
echo "📁 Artifacts directory: $ARTIFACT_DIR"
echo ""
echo "📋 Next steps:"
echo "  1. Move your TapRecord video file to: $ARTIFACT_DIR/demo-video.mov"
echo "  2. Optionally add screenshots to: $ARTIFACT_DIR/screenshots/"
echo "  3. Review bot logs at: $ARTIFACT_DIR/bot-logs.txt"
echo ""

open "$ARTIFACT_DIR"
