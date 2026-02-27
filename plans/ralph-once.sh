#!/bin/bash

# Ralph Wiggum - Single Iteration (Human-in-the-Loop)
# Runs OpenCode once with the Ralph prompt, then exits
# Useful for: testing prompts, debugging, manual supervision

set -e
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/PROMPT.md"

# Validate prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

echo "================================================================================"
echo "Ralph Wiggum - Single Iteration"
echo "================================================================================"
echo "Prompt: $PROMPT_FILE"
echo "Mode:   Human-in-the-loop (one iteration only)"
echo ""
echo "Running OpenCode..."
echo ""

opencode -p "$(cat "$PROMPT_FILE")"

echo ""
echo "================================================================================"
echo "Iteration complete. Check git log and progress.txt for results."
echo "================================================================================"