@plans/prd.json

# Ralph Wiggum Initialization - First Run Setup

You are initializing a new autonomous coding environment for the webhook-monitor project. Your goal is to set up the foundation that will enable subsequent coding agents to work effectively across many context windows.

This is a ONE-TIME setup. After this initialization, all future iterations will use PROMPT.md instead.

---

## 1. Verify Environment

Confirm you're in the correct workspace:

```bash
pwd
```

Expected: `C:\Users\th-g.torre\Desktop\Repos\webhook-monitor` (or equivalent on your system)

Check the git repository status:

```bash
git status
git log --oneline -5
git branch --show-current
```

Ensure you're on the `main` branch with a clean working directory.

---

## 2. Create Ralph Development Branch

Create a long-running branch for all Ralph autonomous work:

```bash
git checkout main
git pull origin main  # Ensure main is up-to-date
git checkout -b ralph/autonomous
```

**Important:** This branch will contain ALL 37 features. Ralph will commit each feature to this branch sequentially. At the end, ONE final PR will merge all features to main.

**Branching strategy:**

- `ralph/autonomous` - Long-running development branch
- All features committed here sequentially
- No intermediate PRs until all features complete
- Enables fully autonomous operation without merge conflicts

---

## 3. Install Dependencies

Ensure all dependencies are current:

```bash
pnpm install
```

Verify installation succeeded and no errors occurred.

---

## 4. Establish Green Baseline

Run all checks to establish a healthy baseline:

```bash
pnpm lint
pnpm check-types
pnpm test
```

**If any checks fail:**

- Document the failures
- Fix them before proceeding
- This is critical: future iterations assume a green baseline

**If all checks pass:**

- Document the green baseline in your initialization notes
- Record the number of passing tests as a reference point

---

## 5. Review the Product Requirements Document

Read @plans/prd.json thoroughly:

- Total features: 37
- Understand the feature structure: id, category, dependencies, description, steps, gatewayTests, passes
- Identify features with no dependencies (these are immediately actionable)
- Understand the dependency graph (which features unlock others)

**Key categories (in priority order):**

1. **functional** - Core features for webhook ingestion and delivery
2. **security** - Authentication, rate limiting, HMAC verification
3. **operational** - Logging, metrics, monitoring
4. **infrastructure** - Docker, deployment configuration
5. **testing** - Integration and load tests
6. **validation** - Chaos testing and resilience validation
7. **frontend** - Web dashboard UI

---

## 6. Create Initialization Script

Create `init.sh` in the project root:

```bash
#!/bin/bash

# webhook-monitor - Development Server Startup
# This script starts all development servers needed for local testing

set -e

echo "Starting webhook-monitor development environment..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Start development servers
echo "Starting all apps in development mode..."
pnpm dev
```

Make it executable:

```bash
chmod +x init.sh
```

Test it works:

```bash
# Don't run for too long, just verify it starts
./init.sh &
sleep 5
pkill -f "pnpm dev" || true
```

---

## 7. Create Basic Smoke Test

Document how to verify the system is working:

Create `scripts/smoke-test.sh`:

```bash
#!/bin/bash

# Basic smoke test - verifies core functionality works

set -e

echo "Running smoke tests..."

# Test 1: API health check
echo "✓ Testing API health endpoint..."
curl -f http://localhost:3001/health || { echo "✗ API health check failed"; exit 1; }

# Test 2: Web app loads
echo "✓ Testing web app loads..."
curl -f http://localhost:3000 > /dev/null || { echo "✗ Web app failed to load"; exit 1; }

echo "✓ All smoke tests passed"
```

Make it executable:

```bash
chmod +x scripts/smoke-test.sh
```

---

## 8. Initialize Progress Log

Create `plans/progress.txt` using the template structure from `plans/progress-template.txt`:

```
################################################################################
#                                                                              #
#  WEBHOOK-MONITOR RALPH PROGRESS LOG                                         #
#  Autonomous Coding Session Tracker                                          #
#                                                                              #
################################################################################

Project: webhook-monitor
Plan File: plans/prd.json
Total Features: 37
Initialized: <current UTC timestamp>

================================================================================
[INITIALIZATION]
================================================================================

┌─ ENVIRONMENT SETUP ──────────────────────────────────────────────────────┐
│ Timestamp:         <YYYY-MM-DD HH:MM:SS UTC>                             │
│ Working Directory: <output of pwd>                                        │
│ Git Branch:        <current branch>                                       │
│ Git Commit:        <current commit hash>                                  │
│                                                                            │
│ Dependencies:      INSTALLED                                               │
│   pnpm version:    <pnpm --version>                                       │
│   node version:    <node --version>                                       │
│                                                                            │
│ Baseline Health:   VERIFIED                                                │
│   pnpm lint:       PASS                                                    │
│   pnpm check-types: PASS                                                   │
│   pnpm test:       PASS (<N> tests passing)                               │
│                                                                            │
│ Artifacts Created:                                                         │
│   - init.sh (development server startup script)                            │
│   - scripts/smoke-test.sh (basic functionality verification)              │
│   - plans/progress.txt (this file)                                        │
└──────────────────────────────────────────────────────────────────────────┘

┌─ PRD ANALYSIS ───────────────────────────────────────────────────────────┐
│ Total Features:    37                                                      │
│ Completed:         <count features with passes: true>                     │
│ Remaining:         <count features with passes: false>                    │
│                                                                            │
│ Immediately Actionable (no dependencies):                                  │
│   - <list feature IDs with dependencies: []>                              │
│                                                                            │
│ Recommended Starting Points:                                               │
│   1. <feature-id>: <brief description> (Category: <category>)             │
│   2. <feature-id>: <brief description> (Category: <category>)             │
│   3. <feature-id>: <brief description> (Category: <category>)             │
└──────────────────────────────────────────────────────────────────────────┘

┌─ NEXT STEPS ─────────────────────────────────────────────────────────────┐
│ The Ralph autonomous coding loop is now ready to begin.                   │
│                                                                            │
│ To start the loop:                                                         │
│   ./plans/ralph-once.sh    (human-in-the-loop, one iteration)             │
│   ./plans/ralph.sh 20      (autonomous, 20 iterations max)                │
│                                                                            │
│ All future iterations will:                                                │
│   1. Read this progress log to understand what's been done                │
│   2. Read prd.json to find the next feature                               │
│   3. Implement ONE feature                                                 │
│   4. Update prd.json and append to this log                               │
│   5. Commit and exit                                                       │
│                                                                            │
│ The loop will continue until all 37 features have passes: true            │
└──────────────────────────────────────────────────────────────────────────┘

================================================================================

```

---

## 9. Create Initial Commit

Commit all initialization artifacts to the ralph/autonomous branch:

```bash
git add init.sh scripts/smoke-test.sh plans/progress.txt
git commit -m "chore: initialize Ralph autonomous coding environment

- Add init.sh for starting development servers
- Add smoke-test.sh for basic health verification
- Initialize progress.txt log for tracking iterations
- Establish green baseline (all tests passing)

Ready for autonomous feature implementation loop."
```

Verify the commit:

```bash
git log -1
git show --stat
```

---

## 10. Push Branch to Remote

Push the ralph/autonomous branch to remote:

```bash
git push -u origin ralph/autonomous
```

**Note:** This branch will contain all 37 features. Do NOT create a PR yet. The PR will be created only after all features are complete.

---

## 11. Summary Report

Output a summary of the initialization:

**Environment Status:**

- ✓ Working directory verified
- ✓ Dependencies installed
- ✓ Green baseline established (all tests passing)
- ✓ Initialization scripts created
- ✓ Progress log initialized
- ✓ Initial commit created

**Feature Analysis:**

- Total features in PRD: 37
- Currently complete: <count with passes: true>
- Ready to implement: <count with passes: false AND no dependencies>
- Blocked by dependencies: <count with passes: false AND has unmet dependencies>

**Recommended First Features:**
List 3-5 features that are good starting points (no dependencies, foundational, unblock others)

**Next Action:**
The initialization is complete. The next agent iteration should use `PROMPT.md` (not this initialization prompt) and begin implementing features.

---

## 12. Exit

Output: `<promise>INITIALIZED</promise>`

This signals that initialization succeeded and the Ralph coding loop is ready to begin.
