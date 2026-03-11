#!/usr/bin/env bash
# HEL Terminal launcher
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

# Create venv if needed
if [ ! -d "$VENV" ]; then
  echo "Setting up virtual environment..."
  python3 -m venv "$VENV"
fi

# Install / upgrade dependencies quietly
"$VENV/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"

# Launch
exec "$VENV/bin/python" "$SCRIPT_DIR/shell.py" "$@"
