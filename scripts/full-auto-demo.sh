#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DEMO_DIR"

TIMESTAMP=$(date +%s)
DEMO_ID="demo-wagered-$TIMESTAMP"
ARTIFACT_DIR="$DEMO_DIR/artifacts/$DEMO_ID"
mkdir -p "$ARTIFACT_DIR"

echo "🎬 Full Auto Demo Recording with TapRecord"
echo "Demo ID: $DEMO_ID"
echo "Artifact dir: $ARTIFACT_DIR"
echo ""

# Verify VPS bot is running
echo "🔍 Verifying VPS bot status..."
if ! ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh status' | grep -q "RUNNING"; then
  echo "❌ VPS bot not running. Please start it first."
  exit 1
fi
echo "✅ VPS bot is running"
echo ""

echo "📱 Step 1: Activating Telegram Desktop..."
osascript << 'APPLESCRIPT'
tell application "Telegram"
  activate
  delay 2
end tell
APPLESCRIPT

sleep 2

echo "📹 Step 2: Starting TapRecord..."
osascript << 'APPLESCRIPT'
tell application "TapRecord"
  activate
  delay 1
end tell

tell application "System Events"
  tell process "TapRecord"
    -- Wait for window
    repeat 10 times
      if exists window 1 then exit repeat
      delay 0.5
    end repeat
    -- Try to start recording with Cmd+Shift+2 (common TapRecord shortcut)
    keystroke "2" using {command down, shift down}
    delay 1
  end tell
end tell
APPLESCRIPT

echo "⏳ Waiting 5 seconds for recording to initialize..."
sleep 5

echo ""
echo "🎮 Step 3: Sending game commands in Telegram..."

# Helper function to send command via Telegram Desktop UI
send_telegram_command() {
  local cmd="$1"
  echo "  📤 Typing: $cmd"
  osascript << APPLESCRIPT
tell application "Telegram"
  activate
  delay 0.5
end tell

tell application "System Events"
  tell process "Telegram"
    keystroke "$cmd"
    delay 0.5
    keystroke return
    delay 2
  end tell
end tell
APPLESCRIPT
  sleep 3
}

send_telegram_command "/newgame"
send_telegram_command "/wagerdemo"
send_telegram_command "/join"
send_telegram_command "/startgame"

echo ""
echo "⏳ Step 4: Game started! Monitoring VPS bot for completion..."
echo "Expected duration: 8-12 minutes"
echo ""

# Poll VPS bot logs for game completion
START_TIME=$(date +%s)
TIMEOUT=900  # 15 minutes
LAST_CHECK=$(date +%s)

while true; do
  ELAPSED=$(($(date +%s) - START_TIME))
  if [ $ELAPSED -gt $TIMEOUT ]; then
    echo ""
    echo "⚠️  Timeout after ${TIMEOUT}s."
    break
  fi
  
  # Check VPS bot logs every 10 seconds
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
echo "🛑 Step 5: Stopping TapRecord recording..."
osascript << 'APPLESCRIPT'
tell application "System Events"
  tell process "TapRecord"
    -- Stop recording with Cmd+Shift+2
    keystroke "2" using {command down, shift down}
    delay 2
  end tell
end tell
APPLESCRIPT

sleep 3

echo ""
echo "📦 Step 6: Collecting artifacts from VPS..."

# Fetch bot logs from VPS
ssh cloud3bet 'cd /home/ubuntu/.openclaw/workspace/hackathon/turing/mindgames-arena && bash scripts/public-demo-bot.sh logs | tail -300' > "$ARTIFACT_DIR/bot-logs.txt"

# Extract game info
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
echo "  Settlement TX: $TX_HASH"
echo "  Action Registry: $ACTION_REGISTRY"
echo "  Mantlescan Settlement: https://sepolia.mantlescan.xyz/tx/$TX_HASH"
echo "  Mantlescan Registry: https://sepolia.mantlescan.xyz/address/$ACTION_REGISTRY"
echo ""
echo "📁 Artifacts saved to: $ARTIFACT_DIR"
echo ""
echo "📋 Next steps:"
echo "  1. Find the TapRecord video file and move it to: $ARTIFACT_DIR/demo-video.mov"
echo "  2. Optionally add screenshots to: $ARTIFACT_DIR/screenshots/"
echo ""

open "$ARTIFACT_DIR"
