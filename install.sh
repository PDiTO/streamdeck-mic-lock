#!/bin/sh
# Build Mic Lock's audio helper and install the plugin into Stream Deck.
#   ./install.sh               install or update
#   ./install.sh --uninstall   remove
set -eu
cd "$(dirname "$0")"
PLUGIN=com.pdito.mic-lock.sdPlugin
SD="$HOME/Library/Application Support/com.elgato.StreamDeck"
TARGET="$SD/Plugins/$PLUGIN"

restart_stream_deck() {
  if pgrep -x "Stream Deck" >/dev/null; then
    echo "Restarting Stream Deck..."
    osascript -e 'quit app "Elgato Stream Deck"' >/dev/null 2>&1 || true
    i=0; while pgrep -x "Stream Deck" >/dev/null && [ $i -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  fi
  open -a "Elgato Stream Deck" || echo "Open the Stream Deck app to finish."
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$TARGET"
  echo "Removed Mic Lock."
  restart_stream_deck
  exit 0
fi

[ "$(uname)" = Darwin ] || { echo "Mic Lock only runs on macOS."; exit 1; }
[ -d "$SD" ] || { echo "Install the Stream Deck app first: https://www.elgato.com/downloads"; exit 1; }
command -v swiftc >/dev/null 2>&1 || { echo "Mic Lock needs Apple's command line tools. Run: xcode-select --install"; exit 1; }

sh scripts/build-helper.sh
mkdir -p "$SD/Plugins"
if [ -L "$TARGET" ]; then
  echo "A development link is installed; it already points at a checkout."
else
  rm -rf "$TARGET"
  cp -R "$PLUGIN" "$TARGET"
fi
restart_stream_deck
echo
echo "Mic Lock is installed. In Stream Deck, find \"Mic Lock\" in the actions list and drag it onto a key."
