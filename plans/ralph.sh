#!/bin/bash

# Ralph Wiggum Autonomous Coding Loop
# Runs OpenCode in a loop until PRD is complete or max iterations reached

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/PROMPT.md"
LOG_DIR="$PROJECT_ROOT/logs"
LOG_FILE="$LOG_DIR/ralph-$(date +%Y%m%d-%H%M%S).log"

# Ensure logs directory exists
mkdir -p "$LOG_DIR"

# Validate arguments
USE_SANDBOX="${2:-false}"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <iterations> [sandbox]" >&2
  echo "Example: $0 20" >&2
  echo "         $0 20 sandbox    # Run in Docker sandbox" >&2
  exit 1
fi

MAX_ITERATIONS=$1

# Validate prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# Initialize log
{
  echo "================================================================================"
  echo "Ralph Wiggum Autonomous Coding Loop"
  echo "================================================================================"
  echo "Start Time:       $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo "Max Iterations:   $MAX_ITERATIONS"
  echo "Project Root:     $PROJECT_ROOT"
  echo "Prompt File:      $PROMPT_FILE"
  echo "Log File:         $LOG_FILE"
  echo "================================================================================"
  echo ""
} | tee "$LOG_FILE"

# Track statistics
SUCCESSFUL_ITERATIONS=0
FAILED_ITERATIONS=0
START_TIME=$(date +%s)

# Main loop
for ((i=1; i<=MAX_ITERATIONS; i++)); do
  ITERATION_START=$(date +%s)
  
  {
    echo "================================================================================"
    echo "ITERATION $i / $MAX_ITERATIONS"
    echo "================================================================================"
    echo "Start Time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    echo ""
  } | tee -a "$LOG_FILE"
  
  # CRITICAL: Run OpenCode as a NEW PROCESS for fresh context window
  # Each iteration starts with zero context from previous runs
  # The agent reads git log and progress.txt to understand what was done
  # This prevents context window exhaustion and ensures consistent performance
  
  set +e  # Temporarily disable exit-on-error to capture failures
  
  if [ "$USE_SANDBOX" = "sandbox" ]; then
    # Run in Docker sandbox
    result=$(docker sandbox run opencode "$PROJECT_ROOT" -- -p "$(cat "$PROMPT_FILE")" 2>&1)
  else
    # Run directly on host
    result=$(opencode -p "$(cat "$PROMPT_FILE")" 2>&1)
  fi
  
  exit_code=$?
  set -e
  
  # Process exits here, freeing all context for the next iteration
  
  # Log the result
  echo "$result" | tee -a "$LOG_FILE"
  
  # Check for errors
  if [ $exit_code -ne 0 ]; then
    {
      echo ""
      echo "ERROR: OpenCode failed with exit code $exit_code"
      echo "Stopping Ralph loop."
      echo ""
    } | tee -a "$LOG_FILE"
    FAILED_ITERATIONS=$((FAILED_ITERATIONS + 1))
    break
  fi
  
  SUCCESSFUL_ITERATIONS=$((SUCCESSFUL_ITERATIONS + 1))
  
  # Check for completion signal
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    {
      echo ""
      echo "================================================================================"
      echo "SUCCESS: PRD complete after $i iterations!"
      echo "================================================================================"
      echo ""
    } | tee -a "$LOG_FILE"
    break
  fi
  
  # Check for stuck state (no commits in recent iterations)
  if [ $i -gt 2 ]; then
    RECENT_COMMITS=$(git rev-list --count HEAD --since="15 minutes ago")
    if [ "$RECENT_COMMITS" -eq 0 ]; then
      {
        echo ""
        echo "WARNING: No git commits in the last 15 minutes."
        echo "Agent may be stuck or encountering repeated failures."
        echo "Consider reviewing the progress log and recent output."
        echo ""
      } | tee -a "$LOG_FILE"
    fi
  fi
  
  ITERATION_END=$(date +%s)
  ITERATION_DURATION=$((ITERATION_END - ITERATION_START))
  
  {
    echo ""
    echo "Iteration Duration: ${ITERATION_DURATION}s"
    echo "---- End of iteration $i ----"
    echo ""
  } | tee -a "$LOG_FILE"
done

# Final statistics
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
MINUTES=$((TOTAL_DURATION / 60))
SECONDS=$((TOTAL_DURATION % 60))

{
  echo "================================================================================"
  echo "Ralph Loop Summary"
  echo "================================================================================"
  echo "Total Iterations:    $((SUCCESSFUL_ITERATIONS + FAILED_ITERATIONS))"
  echo "Successful:          $SUCCESSFUL_ITERATIONS"
  echo "Failed:              $FAILED_ITERATIONS"
  echo "Total Duration:      ${MINUTES}m ${SECONDS}s"
  echo "End Time:            $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo ""
  echo "Log saved to: $LOG_FILE"
  echo "================================================================================"
} | tee -a "$LOG_FILE"

# Exit with appropriate code
if [ $FAILED_ITERATIONS -gt 0 ]; then
  echo "Exiting with failure (errors occurred)" >&2
  exit 1
elif [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
  echo "Exiting with success (PRD complete)"
  exit 0
else
  echo "Reached max iterations ($MAX_ITERATIONS) without completion"
  exit 2
fi