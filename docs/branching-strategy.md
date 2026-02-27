# Git Branching Strategy for Ralph

This document describes the branching and PR workflow for Ralph autonomous coding.

---

## Overview

Ralph uses a **single long-running branch** strategy for fully autonomous operation. All 37 features are implemented sequentially on one branch (`ralph/autonomous`), then merged to main via ONE final pull request.

**Why this strategy?**

- ✅ **No merge conflicts** - Each feature builds on the previous one
- ✅ **Fully autonomous** - No waiting for PR approvals between features
- ✅ **Clean implementation** - Features can depend on each other naturally
- ✅ **Single review** - All work reviewed together at the end

---

## Branch Structure

```
main (stable, production-ready)
 └─ ralph/autonomous (long-running development branch)
     ├─ Commit 1: chore: initialize Ralph environment
     ├─ Commit 2: feat(api): idempotency key extraction
     ├─ Commit 3: feat(api): Zod validation
     ├─ Commit 4: feat(worker): delivery retry logic
     ...
     └─ Commit 38: feat(web): webhook analytics dashboard
```

---

## Branch Types

### 1. **Main Branch (`main`)**

- **Purpose:** Stable, production-ready code
- **Protection:** Never commit directly to main
- **Merges:** Only via approved PRs
- **Status:** Always green (all tests passing)

### 2. **Ralph Development Branch (`ralph/autonomous`)**

- **Purpose:** Long-running branch for all 37 features
- **Created by:** `ralph-init.sh` (PROMPT-INIT.md)
- **Lifetime:** Entire autonomous coding session
- **Contents:**
  - Initial commit: Ralph infrastructure setup
  - Commits 2-38: Each feature implementation
- **Lifecycle:**
  1. Created from `main` during initialization
  2. 37 features committed sequentially
  3. Final PR created: `ralph/autonomous → main`
  4. Merged after review
  5. Branch deleted

---

## Workflow

### Step 1: Initialization (One Time)

Run the initialization script to set up Ralph infrastructure:

```bash
./plans/ralph-init.sh
```

This script:

1. Creates `ralph/autonomous` branch from `main`
2. Installs dependencies
3. Verifies green baseline (all tests pass)
4. Creates initialization scripts (`init.sh`, `smoke-test.sh`)
5. Initializes `plans/progress.txt` log
6. Commits setup artifacts
7. Pushes branch to remote

**Result:** `ralph/autonomous` branch ready with initialization commit.

### Step 2: Feature Implementation (37 Iterations)

Run the autonomous loop:

```bash
# Run indefinitely until all features complete
./plans/ralph.sh

# Or limit iterations (e.g., 20 max)
./plans/ralph.sh 20
```

Each iteration:

1. Reads `progress.txt` and `git log` to understand state
2. Reads `prd.json` to select next feature
3. Verifies on `ralph/autonomous` branch (never switches branches)
4. Implements ONE feature following its steps
5. Runs gateway tests to verify feature works
6. Runs full test suite (`lint`, `check-types`, `test`)
7. Updates `prd.json` (`passes: false → true`)
8. Appends to `progress.txt` with implementation details
9. Commits to `ralph/autonomous` branch
10. Exits (next iteration starts with fresh context)

**Important:** No pushes or PRs between features. All work stays local on `ralph/autonomous`.

### Step 3: Completion (After All 37 Features)

When the final feature is marked complete:

1. **Push branch to remote:**

   ```bash
   git push -u origin ralph/autonomous
   ```

2. **Create ONE final PR:**

   ```bash
   gh pr create \
     --title "feat: implement all 37 webhook-monitor features" \
     --body "$(cat <<'EOF'
   ## Summary

   Autonomous implementation of all 37 features from the PRD.

   ### Functional Features
   - idempotency-key-extraction: Extract and validate idempotency keys
   - zod-validation: Request validation with Zod schemas
   - worker-retry-logic: Exponential backoff for failed deliveries
   - (... list all functional features ...)

   ### Security Features
   - (... list all security features ...)

   ### Operational Features
   - (... list all operational features ...)

   ### Infrastructure Features
   - (... list all infrastructure features ...)

   ### Testing Features
   - (... list all testing features ...)

   ### Validation Features
   - (... list all validation features ...)

   ### Frontend Features
   - (... list all frontend features ...)

   **All tests passing:** Yes
   **Total commits:** 38 (1 init + 37 features)
   **Branch:** ralph/autonomous
   EOF
   )" \
     --assignee @me
   ```

3. **Review and merge:**
   - Human reviews the final PR
   - All tests must pass in CI
   - Merge using "Squash and merge" or "Merge commit" (your choice)
   - Delete `ralph/autonomous` branch after merge

---

## Branching Rules

### ✅ DO:

1. **Stay on `ralph/autonomous` throughout:**
   - Never switch branches during feature implementation
   - Every iteration verifies branch name first

2. **Commit after each feature:**
   - One feature = one commit
   - Descriptive commit messages with feature ID

3. **Keep commits local until complete:**
   - Don't push after each feature
   - Only push when all 37 features done

4. **Follow dependency order:**
   - Only implement features where dependencies have `passes: true`
   - Use priority algorithm from PROMPT.md

5. **Maintain green baseline:**
   - All tests must pass before moving to next feature
   - If tests break, fix immediately

### ❌ DON'T:

1. **Never create separate feature branches:**
   - All work on `ralph/autonomous`
   - No `feat/<feature-id>` branches

2. **Never push between features:**
   - Defeats the autonomous purpose
   - Push only when complete

3. **Never create PRs between features:**
   - One final PR at the end
   - No intermediate code review

4. **Never merge to main early:**
   - Wait until all 37 features complete
   - Partial merges cause conflicts

5. **Never switch branches during implementation:**
   - Ralph always works on `ralph/autonomous`
   - Switching branches breaks the workflow

---

## Handling Interruptions

**Q: What if Ralph stops after 15 features?**

Resume by running `ralph.sh` again:

```bash
./plans/ralph.sh
```

Ralph will:

1. Check current branch (`ralph/autonomous`)
2. Read `git log` to see which features are committed
3. Read `progress.txt` to understand last session
4. Continue from feature 16

**Q: What if I need to restart from scratch?**

```bash
# Delete local branch
git checkout main
git branch -D ralph/autonomous

# Delete remote branch (if pushed)
git push origin --delete ralph/autonomous

# Re-run initialization
./plans/ralph-init.sh
```

**Q: What if I want to manually add features between Ralph runs?**

```bash
# Check out the branch
git checkout ralph/autonomous

# Make your changes
# ... edit files ...

# Commit your work
git commit -am "feat(api): manual feature addition"

# Update progress.txt manually
echo "[MANUAL ADDITION] <timestamp>: Added feature X" >> plans/progress.txt

# Ralph will continue from this state on next run
```

---

## Comparison: Why Not Branch-Per-Feature?

### ❌ Branch-Per-Feature Problems:

```
main
 ├─ feat/feature-1 (has Feature 1 code)
 │   └─ PR #1
 ├─ feat/feature-2 (branched from main, MISSING Feature 1!)
 │   └─ PR #2 (conflicts with PR #1)
 └─ feat/feature-3 (branched from main, MISSING Features 1 & 2!)
     └─ PR #3 (massive conflicts)
```

**Problems:**

- ❌ Feature 2 doesn't have Feature 1's code (branched from main)
- ❌ Merge conflicts between all PRs
- ❌ Must wait for PR approval between features (breaks autonomy)
- ❌ Features can't depend on each other

### ✅ Single Long-Running Branch Solution:

```
main
 └─ ralph/autonomous
     ├─ Commit: Feature 1 (has Feature 1 code)
     ├─ Commit: Feature 2 (has Feature 1 + 2 code)
     ├─ Commit: Feature 3 (has Feature 1 + 2 + 3 code)
     └─ ... (no conflicts, fully autonomous)
```

**Benefits:**

- ✅ Each feature builds on the previous
- ✅ No merge conflicts
- ✅ No waiting for PRs
- ✅ Features can depend on each other naturally

---

## Pull Request Guidelines

### Final PR Title

```
feat: implement all 37 webhook-monitor features
```

### Final PR Body Template

```markdown
## Summary

Autonomous implementation of all 37 features from the PRD.

### Functional Features (Core webhook system)

- feature-id-1: Brief description
- feature-id-2: Brief description
- ...

### Security Features

- feature-id-X: Brief description
- ...

### Operational Features

- feature-id-Y: Brief description
- ...

### Infrastructure Features

- feature-id-Z: Brief description
- ...

### Testing Features

- feature-id-A: Brief description
- ...

### Validation Features

- feature-id-B: Brief description
- ...

### Frontend Features

- feature-id-C: Brief description
- ...

**All tests passing:** Yes
**Total commits:** 38 (1 init + 37 features)
**Branch:** ralph/autonomous
**PRD:** plans/prd.json (all features marked `passes: true`)
```

### PR Review Checklist

Before approving the final PR:

- ✅ All 37 features have `passes: true` in `prd.json`
- ✅ All tests pass (`pnpm test`)
- ✅ Type checking passes (`pnpm check-types`)
- ✅ Linting passes (`pnpm lint`)
- ✅ Progress.txt shows all features documented
- ✅ Code review completed (check 38 commits)
- ✅ Manual smoke test performed

---

## Merge Strategy

### Option 1: Squash and Merge (Recommended)

**Pros:**

- ✅ Clean main history (one commit for all 37 features)
- ✅ Easier to revert if needed

**Cons:**

- ❌ Loses individual feature commit history

**When to use:** If you want a clean, minimal main branch history.

### Option 2: Merge Commit

**Pros:**

- ✅ Preserves all 38 individual commits
- ✅ Full history of each feature implementation

**Cons:**

- ❌ More verbose main history

**When to use:** If you want detailed history of each feature.

---

## FAQ

**Q: Why not create PRs for each feature?**

A: That would require waiting for human approval between features, breaking autonomy. Also causes merge conflicts when features branch from main in parallel.

**Q: What if a feature breaks tests?**

A: Ralph's workflow requires all tests to pass before moving to the next feature. If tests break:

1. Ralph fixes the issue immediately
2. Re-runs test suite
3. Only proceeds when green

**Q: Can I review code during implementation?**

A: Yes! Check the branch on GitHub:

```bash
git push origin ralph/autonomous  # Push current state
```

Then view on GitHub. But don't create a PR yet—wait for completion.

**Q: What if I want to stop Ralph after 10 features?**

A: Stop the script (Ctrl+C), review the 10 features, then restart `ralph.sh` to continue.

**Q: Can I make manual edits to ralph/autonomous?**

A: Yes! Ralph reads git history to understand state. Just:

1. Make your changes on `ralph/autonomous`
2. Commit them
3. Optionally update `progress.txt`
4. Run `ralph.sh` to continue

**Q: What happens if Ralph crashes mid-feature?**

A: The uncommitted work is lost. Ralph starts the next iteration fresh:

1. Reads `progress.txt` (last feature not listed)
2. Reads `git log` (last feature not committed)
3. Selects the same feature again
4. Implements from scratch (fresh context, fresh attempt)

**Q: Should I protect the ralph/autonomous branch?**

A: No. Ralph needs to commit directly. Protect `main` instead.

---

## Integration with Ralph Loop

The Ralph scripts handle branching automatically:

**ralph-init.sh:**

```bash
git checkout -b ralph/autonomous
# ... initialization ...
git commit -m "chore: initialize Ralph environment"
git push -u origin ralph/autonomous
```

**ralph.sh (each iteration):**

```bash
# Verify on correct branch
git branch --show-current  # Must be ralph/autonomous

# Implement feature
# ... code changes ...

# Commit
git add .
git commit -m "feat(scope): feature description"

# DO NOT push (stays local)
```

**ralph.sh (after all features complete):**

```bash
# Push branch
git push -u origin ralph/autonomous

# Create final PR
gh pr create --title "..." --body "..." --assignee @me

# Output completion signal
echo "<promise>COMPLETE</promise>"
```

---

## References

- [AGENTS.md PR Guidelines](../AGENTS.md) - Repository-specific PR rules
- [PROMPT.md](../plans/PROMPT.md) - Iteration instructions
- [PROMPT-INIT.md](../plans/PROMPT-INIT.md) - Initialization instructions
- [fresh-context.md](./fresh-context.md) - How fresh context works

---

**Summary:** Ralph uses a single long-running branch (`ralph/autonomous`) for fully autonomous feature implementation. All 37 features are committed sequentially to this branch, then merged to main via ONE final PR. This avoids merge conflicts and enables true autonomous operation without human intervention between features.
