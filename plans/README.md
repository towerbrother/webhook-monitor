# Ralph Wiggum Autonomous Coding System

This directory contains the configuration and scripts for running the Ralph Wiggum autonomous coding loop on the webhook-monitor project.

---

## 🚀 New to Ralph? Start Here!

**If this is your first time, read this:** [`START-HERE.md`](START-HERE.md)

It explains everything step-by-step, like you're 5 years old! 🎨

---

## Quick Start

### 1. First-Time Initialization

**Run this ONCE before starting the autonomous coding loop:**

```bash
./plans/ralph-init.sh
```

Choose option `2` (Docker sandbox - recommended for safety).

This will:

- Create `ralph/autonomous` branch (long-running development branch)
- Verify environment and install dependencies
- Establish green baseline (all tests passing)
- Create `init.sh` and `scripts/smoke-test.sh`
- Initialize `progress.txt` with environment details
- Create initial commit to `ralph/autonomous`
- Push branch to remote

### 2. Run the Autonomous Loop

After initialization, start the Ralph loop:

```bash
# Human-in-the-loop (one iteration, watch what happens)
./plans/ralph-once.sh

# Fully autonomous (20 iterations max, direct execution)
./plans/ralph.sh 20

# Fully autonomous (20 iterations in Docker sandbox - recommended)
./plans/ralph.sh 20 sandbox

# Fully autonomous (run until complete in sandbox)
./plans/ralph.sh 999 sandbox
```

Ralph will:

- Work on the `ralph/autonomous` branch
- Implement one feature per iteration
- Commit each feature locally (no push between features)
- Continue until all 37 features are complete

### 3. Final Pull Request

When all 37 features are complete, Ralph will:

1. Push `ralph/autonomous` to remote
2. Create ONE final PR merging all features to `main`
3. Output: `<promise>COMPLETE</promise>`

Then you:

- Review the PR on GitHub
- Verify all tests pass
- Merge the PR to main
- Delete the `ralph/autonomous` branch

---

## File Overview

| File                        | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| **`START-HERE.md`**         | Beginner-friendly guide (read this first!)                                      |
| **`prd.json`**              | Product Requirements Document - 37 features with dependencies, steps, and tests |
| **`PROMPT-INIT.md`**        | Initialization prompt (run once at project start)                               |
| **`PROMPT.md`**             | Coding loop prompt (run on every iteration)                                     |
| **`progress.txt`**          | Append-only log of all iterations                                               |
| **`progress-template.txt`** | Template structure for progress entries                                         |
| **`ralph-init.sh`**         | Initialization script (run once)                                                |
| **`ralph.sh`**              | Main autonomous loop script with error handling and logging                     |
| **`ralph-once.sh`**         | Single iteration script for testing and debugging                               |

**Documentation:**

- [`../docs/fresh-context.md`](../docs/fresh-context.md) - How Ralph ensures each iteration starts with fresh context
- [`../docs/sandbox-spec.md`](../docs/sandbox-spec.md) - Security and isolation specifications
- [`../docs/branching-strategy.md`](../docs/branching-strategy.md) - Git branching workflow and PR guidelines

---

## How It Works

### The Ralph Wiggum Technique

Ralph is a simple but powerful pattern for autonomous coding:

1. **Fresh Context:** Each iteration runs as a new process with zero memory of previous iterations
2. **Plan:** Agent reads the PRD and progress log to understand current state
3. **Select:** Agent chooses ONE feature to implement (based on dependencies and priority)
4. **Implement:** Agent writes code, runs tests, verifies the feature works
5. **Document:** Agent updates the PRD, appends to progress log, commits to `ralph/autonomous`
6. **Repeat:** Loop continues until all features are complete

**Key principles:**

- One feature per iteration (incremental progress)
- All work on single long-running branch (`ralph/autonomous`)
- Always leave codebase in clean state (tests passing)
- Document everything (future iterations have no memory)
- Use git history as context (time-travel debugging)
- No pushes/PRs between features (fully autonomous)
- ONE final PR after all features complete

### Initialization vs. Coding Loops

**`PROMPT-INIT.md` (run once):**

- Creates `ralph/autonomous` branch from `main`
- Sets up the environment for autonomous work
- Creates helper scripts (`init.sh`, `smoke-test.sh`)
- Establishes green baseline
- Initializes progress log
- Pushes initial commit to remote

**`PROMPT.md` (run in loop):**

- Verifies on `ralph/autonomous` branch
- Reads PRD and progress log
- Selects highest-priority feature with satisfied dependencies
- Implements ONE feature
- Runs all tests and verification
- Updates PRD and progress log
- Commits locally (no push)
- When all features complete: pushes branch and creates final PR

---

## Feature Selection Algorithm

The agent prioritizes features using these criteria:

1. **Status:** Only select features with `passes: false`
2. **Dependencies:** Only select if ALL dependencies have `passes: true`
3. **Category priority:**
   - functional > security > operational > infrastructure > testing > validation > frontend
4. **Impact:** Within same category, prefer features that unblock the most downstream work
5. **Complexity:** If tied, prefer simpler features (fewer steps)

---

## Progress Tracking

Every iteration appends to `progress.txt` with:

- Session metadata (timestamp, branch, working directory)
- Pre-flight checks (git status, test results)
- Feature selection rationale
- Implementation steps with results
- Gateway test verification
- Commit details
- Notes for next session

This log enables:

- **Debugging:** Trace exactly what happened in each iteration
- **Continuity:** New context windows understand previous work
- **Accountability:** Full audit trail of autonomous changes

---

## Verification & Testing

Before marking a feature complete, the agent must:

1. **Gateway tests:** Run all tests in the feature's `gatewayTests` array
   - API endpoints: Use curl or HTTP client
   - Web features: Use browser automation (Playwright/Puppeteer)
2. **Unit tests:** `pnpm test` must pass
3. **Type checking:** `pnpm check-types` must pass
4. **Linting:** `pnpm lint` must pass

Only after ALL checks pass can the feature be marked `passes: true` in the PRD.

---

## Safety & Sandboxing

See [`../docs/sandbox-spec.md`](../docs/sandbox-spec.md) for full security details.

### Docker Sandbox (Recommended)

Ralph supports running in Docker sandboxes for isolation:

```bash
# Run initialization in sandbox
./plans/ralph-init.sh
# Choose option 2

# Run single iteration in sandbox
./plans/ralph-once.sh
# Choose option 2

# Run autonomous loop in sandbox
./plans/ralph.sh 20 sandbox
```

**Benefits:**

- File access limited to workspace directory
- Network isolation
- Process isolation
- Can't affect host system

**How it works:**

- Uses `docker sandbox run opencode <workspace>`
- Automatically creates and manages sandbox
- Workspace mounted at same path inside container
- Git operations work seamlessly

### Direct Execution

If you prefer to run without Docker:

```bash
# Choose option 1 during interactive scripts
# Or omit 'sandbox' parameter: ./plans/ralph.sh 20
```

OpenCode runs with your user permissions and has access to your file system.

---

## Monitoring & Logs

### Execution Logs

All loop runs create timestamped logs in `logs/`:

```
logs/ralph-20260227-143022.log
```

Logs include:

- Each iteration's output
- Error messages and exit codes
- Duration and statistics
- Completion status

### Stuck Detection

The loop monitors for stuck agents:

- No commits in 15 minutes → warning
- 3 iterations with no progress → consider manual intervention

### Completion Signal

When ALL 37 features have `passes: true`, the agent outputs:

```
<promise>COMPLETE</promise>
```

This signals successful PRD completion and exits the loop.

---

## Troubleshooting

### "Agent is stuck" (no commits for several iterations)

**Causes:**

- Feature has unmet dependencies
- Baseline tests are failing
- Feature is too complex to complete in one iteration

**Solutions:**

1. Check `progress.txt` for patterns in recent attempts
2. Verify dependency features are actually complete
3. Manually fix any baseline test failures
4. Consider breaking the feature into smaller sub-features

### "Tests failing after agent iteration"

**Causes:**

- Agent marked feature complete prematurely
- Flaky tests
- Environment issues

**Solutions:**

1. Review the commit: `git log -1 --stat`
2. Run tests manually: `pnpm test`
3. If needed, revert: `git revert HEAD`
4. Update PROMPT.md to emphasize testing requirements

### "Agent making too many changes at once"

**Causes:**

- Prompt not enforcing single-feature constraint
- Feature definition too broad

**Solutions:**

1. Review PROMPT.md and ensure "ONLY WORK ON A SINGLE FEATURE" is clear
2. Break large features into smaller ones in `prd.json`
3. Add more specific steps to feature definitions

---

## Customization

### Changing Feature Priority

Edit the priority logic in `PROMPT.md`:

```markdown
**Prioritize by:**

1. Your custom priority criteria
2. Category order: ...
3. ...
```

### Adding Custom Verification

Add to the "Verify with Gateway Tests" section in `PROMPT.md`:

```markdown
**For X features:**

- Use Y tool to verify Z
- Check that A matches B
```

### Different Loop Types

The Ralph pattern works for any iterative task:

| Loop Type               | PRD Content           | Success Criteria             |
| ----------------------- | --------------------- | ---------------------------- |
| **Feature development** | Features to implement | All features complete        |
| **Test coverage**       | Uncovered code paths  | Coverage > X%                |
| **Bug fixes**           | GitHub issues         | All issues closed            |
| **Refactoring**         | Code smells           | No linting/complexity issues |

Just update `prd.json` and `PROMPT.md` to match your use case.

---

## References

- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [AI Hero: Getting Started with Ralph](https://www.aihero.dev/getting-started-with-ralph)
- [Ralph Wiggum Technique Overview](https://ghuntley.com/ralph/)
- [Docker Sandboxes Documentation](https://docs.docker.com/ai/sandboxes/)

---

## Contributing

When improving the Ralph system:

1. **Test changes** with `ralph-once.sh` before running full loops
2. **Document** updates to prompts or scripts in this README
3. **Preserve** the append-only nature of `progress.txt`
4. **Never edit** feature definitions in `prd.json` (only change `passes` flags)

---

**Happy autonomous coding! 🤖**
