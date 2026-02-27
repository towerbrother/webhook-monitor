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
ITERATION_TIMEOUT=${ITERATION_TIMEOUT:-1800}  # 30 minutes default timeout per iteration

# Ensure logs directory exists
mkdir -p "$LOG_DIR"

# Validate arguments
if [ -z "${1:-}" ]; then
  echo "Usage: $0 <iterations>" >&2
  echo "Example: $0 20" >&2
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
  echo "Iteration Timeout: ${ITERATION_TIMEOUT}s"
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
  
  # Use a temp file to capture output while still streaming to console
  # This avoids hanging when opencode needs TTY interaction
  ITERATION_OUTPUT=$(mktemp)
  trap "rm -f '$ITERATION_OUTPUT'" EXIT
  
  set +e  # Temporarily disable exit-on-error to capture failures
  # Run with timeout to prevent hanging indefinitely
  if command -v timeout &> /dev/null; then
    timeout "$ITERATION_TIMEOUT" opencode run "@$PROMPT_FILE" 2>&1 | tee "$ITERATION_OUTPUT" | tee -a "$LOG_FILE"
    exit_code=${PIPESTATUS[0]}
    # timeout returns 124 on timeout
    if [ $exit_code -eq 124 ]; then
      {
        echo ""
        echo "WARNING: Iteration timed out after ${ITERATION_TIMEOUT}s"
        echo "Next iteration will attempt recovery..."
        echo ""
      } | tee -a "$LOG_FILE"
      FAILED_ITERATIONS=$((FAILED_ITERATIONS + 1))
      rm -f "$ITERATION_OUTPUT"
      continue
    fi
  else
    # Fallback for systems without timeout command (e.g., some macOS)
    opencode run "@$PROMPT_FILE" 2>&1 | tee "$ITERATION_OUTPUT" | tee -a "$LOG_FILE"
    exit_code=${PIPESTATUS[0]}
  fi
  set -e
  
  # Process exits here, freeing all context for the next iteration
  
  # Read result from temp file for completion check
  result=$(cat "$ITERATION_OUTPUT")
  rm -f "$ITERATION_OUTPUT"
  
  # Check for errors
  if [ $exit_code -ne 0 ]; then
    {
      echo ""
      echo "WARNING: OpenCode failed with exit code $exit_code"
      echo "Next iteration will attempt recovery..."
      echo ""
    } | tee -a "$LOG_FILE"
    FAILED_ITERATIONS=$((FAILED_ITERATIONS + 1))
    # Continue to next iteration - the agent will detect and recover from the failure
    continue
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
if [[ "${result:-}" == *"<promise>COMPLETE</promise>"* ]]; then
  echo "Exiting with success (PRD complete)"
  exit 0
elif [ $FAILED_ITERATIONS -gt 0 ] && [ $SUCCESSFUL_ITERATIONS -eq 0 ]; then
  echo "Exiting with failure (all iterations failed)" >&2
  exit 1
else
  echo "Reached max iterations ($MAX_ITERATIONS) - $SUCCESSFUL_ITERATIONS successful, $FAILED_ITERATIONS failed"
  exit 2
fi