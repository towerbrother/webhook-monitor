#!/bin/bash

# Ralph Wiggum - Initialization Script
# Run this ONCE before starting the autonomous coding loop
# This sets up the environment for Ralph to work effectively

set -e
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_PROMPT="$SCRIPT_DIR/PROMPT-INIT.md"

# Validate init prompt exists
if [ ! -f "$INIT_PROMPT" ]; then
  echo "ERROR: Initialization prompt not found: $INIT_PROMPT" >&2
  exit 1
fi

echo "================================================================================"
echo "Ralph Wiggum - First-Time Initialization"
echo "================================================================================"
echo "This script will set up your environment for autonomous coding."
echo ""
echo "It will:"
echo "  - Verify your environment and install dependencies"
echo "  - Run tests to establish a green baseline"
echo "  - Create helper scripts (init.sh, smoke-test.sh)"
echo "  - Initialize the progress log"
echo "  - Create an initial commit"
echo ""
echo "After initialization, you can run:"
echo "  ./plans/ralph-once.sh  (test one iteration)"
echo "  ./plans/ralph.sh 20    (run 20 autonomous iterations)"
echo ""
echo "================================================================================"
echo ""
echo "Running initialization with OpenCode..."
echo ""

opencode -p "$(cat "$INIT_PROMPT")"

echo ""
echo "================================================================================"
echo "Initialization complete!"
echo ""
echo "Next steps:"
echo "  1. Review the initialization commit: git log -1"
echo "  2. Check progress.txt for environment details"
echo "  3. Run a single iteration to test: ./plans/ralph-once.sh"
echo "  4. When ready, start the loop: ./plans/ralph.sh 20"
echo "================================================================================"
