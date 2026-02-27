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
echo "Choose execution mode:"
echo "  1) Direct execution (OpenCode runs on host)"
echo "  2) Docker sandbox (OpenCode runs in isolated container) [RECOMMENDED]"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
  1)
    echo ""
    echo "Running OpenCode directly on host..."
    echo ""
    opencode -p "$(cat "$PROMPT_FILE")"
    ;;
  2)
    echo ""
    echo "Running OpenCode in Docker sandbox..."
    echo ""
    # Check if docker is available
    if ! command -v docker &> /dev/null; then
      echo "ERROR: Docker not found. Please install Docker Desktop:" >&2
      echo "  https://docs.docker.com/desktop/install" >&2
      exit 1
    fi
    
    # Run OpenCode in Docker sandbox
    # The workspace is the project root (one level up from script dir)
    docker sandbox run opencode "$SCRIPT_DIR/.." -- -p "$(cat "$PROMPT_FILE")"
    ;;
  *)
    echo "Invalid choice. Exiting." >&2
    exit 1
    ;;
esac

echo ""
echo "================================================================================"
echo "Iteration complete. Check git log and progress.txt for results."
echo "================================================================================"