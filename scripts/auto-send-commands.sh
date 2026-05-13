#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 Auto-sending commands and monitoring"
echo "Demo ID: $DEMO_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Verify VPS bot
if ! ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh status' | grep -q "RUNNING"; then
  echo "❌ VPS bot not running"
  exit 1
fi
echo "✅ VPS bot running"
echo ""

echo "📱 Activating Telegram..."
osascript -e 'tell application "Telegram" to activate' -e 'delay 1'
sleep 2

echo "🎮 Sending commands..."

# Send commands
send_cmd() {
  echo "  📤 $1"
  osascript -e "tell application \"System Events\" to tell process \"Telegram\" to keystroke \"$1\"" \
            -e 'tell application "System Events" to tell process "Telegram" to keystroke return' \
            -e 'delay 2'
  sleep 2
}

send_cmd "/newgame"
send_cmd "/wagerdemo"
send_cmd "/join"
send_cmd "/startgame"

echo ""
echo "⏳ Monitoring game (max 15 min)..."
echo ""

START=$(date +%s)
LAST=$(date +%s)
while true; do
  ELAPSED=$(($(date +%s) - START))
  if [ $ELAPSED -gt 900 ]; then
    echo ""
    echo "⚠️  Timeout"
    break
  fi
  
  if [ $(($(date +%s) - LAST)) -ge 10 ]; then
    if ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh logs | tail -30' | grep -q "turing-telegram-game-finalized"; then
      echo ""
      echo "✅ Game finished!"
      sleep 5
      break
    fi
    echo -n "."
    LAST=$(date +%s)
  fi
  sleep 2
done

echo ""
echo ""
echo "🛑 Game complete! Stop TapRecord now."
echo ""
echo "📦 Collecting artifacts..."

ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh logs | tail -300' > "$ARTIFACT_DIR/bot-logs.txt"

GAME_ID=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"gameId":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
TX=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"txHash":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
REG=$(grep "turing-telegram-game-finalized" "$ARTIFACT_DIR/bot-logs.txt" | tail -1 | grep -o '"actionRegistryAddress":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo "$GAME_ID" > "$ARTIFACT_DIR/game-id.txt"
echo "$TX" > "$ARTIFACT_DIR/settlement-tx.txt"
echo "$REG" > "$ARTIFACT_DIR/action-registry.txt"
echo "$DEMO_ID" > "$ARTIFACT_DIR/demo-id.txt"
date > "$ARTIFACT_DIR/recorded-at.txt"
mkdir -p "$ARTIFACT_DIR/screenshots"

echo ""
echo "📊 Demo:"
echo "  Game: $GAME_ID"
echo "  TX: $TX"
echo "  Registry: $REG"
echo "  https://sepolia.mantlescan.xyz/tx/$TX"
echo ""
echo "📁 $ARTIFACT_DIR"
echo ""

open "$ARTIFACT_DIR"
