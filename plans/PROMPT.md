@plans/prd.json @plans/progress.txt

# Ralph Wiggum Coding Loop - Iteration Instructions

You are working in an autonomous coding loop with a **FRESH CONTEXT WINDOW**. You have NO memory of previous iterations. Your goal is to make incremental progress on ONE feature, leave the codebase in a clean state, and document your work for the next iteration.

## Context Window Isolation

**IMPORTANT:** Each iteration starts with a completely fresh context:

- You have zero memory from previous iterations
- You must read `progress.txt` and `git log` to understand what was done
- The codebase state (files, git history) is your only source of truth
- This ensures consistent performance across many iterations

## Error Handling Principle

**When something goes wrong, DO NOT give up. Persist and find a solution.**

- If a command fails, understand why and try a different approach
- If tests fail, debug and fix the issue - try at least 3 different solutions
- If you hit a blocker, document it thoroughly and try alternative approaches
- Only after exhausting multiple attempts should you consider a feature blocked
- **Never exit an iteration with uncommitted broken state** - either fix it or revert

## 1. Get Your Bearings

Start every session by understanding the current state:

- Run `pwd` to confirm your working directory
- Run `git branch --show-current` to verify you're on `ralph/autonomous`
- Run `git status` to check for uncommitted changes
- Run `git log --oneline -10` to see recent work
- Read @plans/progress.txt to understand what was done in previous iterations
- Read @plans/prd.json to see the full feature list

**CRITICAL:** You should ALWAYS be on branch `ralph/autonomous`. If not, switch to it:

```bash
git checkout ralph/autonomous
```

## 2. Handle Uncommitted Changes

Check for leftover state from previous iterations:

```bash
git status
```

If there are uncommitted changes:

1. **Assess the state** - run `pnpm lint && pnpm check-types && pnpm test`
2. **If all checks pass** - the previous iteration likely completed but failed to commit. Review the changes, commit them with an appropriate message, and update prd.json if needed.
3. **If checks fail** - try to fix the issues. If unfixable after 2-3 attempts, revert: `git checkout .`

Document any recovery actions in progress.txt.

## 3. Select the Next Feature

Choose ONE feature to work on using these criteria:

**ONLY select features where:**

- `passes: false` (not yet complete)
- ALL dependencies have `passes: true` (dependencies satisfied)

**Prioritize by:**

1. Category order: functional > security > operational > infrastructure > testing > validation > frontend
2. Within same category, choose the feature that unblocks the most downstream dependencies
3. If tied, choose the feature with fewer implementation steps (lower complexity)

**Document your selection rationale** in progress.txt explaining why you chose this feature.

## 4. Verify Baseline Health

Before implementing, ensure the codebase is in a clean state:

```bash
pnpm lint
pnpm check-types
pnpm test
```

**If baseline is red:**

- Fix the failing tests/types FIRST before working on a new feature
- Document the fix in progress.txt
- Commit the fix with message: "fix: restore green baseline - <brief description>"

## 5. Implement the Feature

Follow the feature's `steps` array from prd.json:

- Work through each step methodically
- Document each step in progress.txt with timestamp, files modified, and result
- If you encounter blockers, document them and consider selecting a different feature

## 6. Verify with Gateway Tests

**Gateway tests are NON-NEGOTIABLE. You must not exit the iteration until all gateway tests pass.**

Before marking a feature complete, run ALL tests listed in the feature's `gatewayTests` array:

**For API endpoints:**

- Use curl, Postman, or HTTP client to test each scenario
- Verify status codes, response bodies, and headers match expectations

**For web features:**

- Use browser automation (Playwright/Puppeteer) to test as a human user would
- Take screenshots or record videos of successful tests
- Verify UI renders correctly, interactions work, and data persists

**Document test results** in progress.txt:

- ✓ Test passed: describe what was verified
- ✗ Test failed: describe the issue and how you fixed it

**If any gateway test fails:**

1. **Do NOT give up.** Analyze the failure and try a different approach.
2. Try at least 3 different solutions before considering the feature blocked.
3. For each attempt:
   - Document what you tried
   - Document why it failed
   - Document what you'll try next
4. Re-run ALL gateway tests after each fix attempt.
5. Only after exhausting multiple approaches AND documenting them, you may:
   - Revert your changes: `git checkout .`
   - Document the blocker in progress.txt with details of all attempted solutions
   - Select a different feature to work on

**CRITICAL:** Do NOT mark the feature complete until ALL gateway tests pass. Do NOT exit the iteration with failing gateway tests unless you have tried multiple approaches and documented the blocker.

## 7. Run Full Test Suite

After implementation and gateway tests:

```bash
pnpm lint        # Must pass
pnpm check-types # Must pass
pnpm test        # Must pass
```

All checks must be green before proceeding.

## 8. Update the PRD

In @plans/prd.json, update ONLY the `passes` field for your feature:

```json
{
  "id": "your-feature-id",
  "passes": true // Change false → true
}
```

**CRITICAL:** Do NOT edit any other fields. Do NOT remove features. Do NOT modify descriptions, steps, or gatewayTests.

## 9. Document Your Progress

**CRITICAL: progress.txt is an APPEND-ONLY file. You must NEVER overwrite it.**

To update progress.txt correctly:

1. **Read the ENTIRE file first** using `cat plans/progress.txt` or your file read tool
2. **Append your new SESSION block to the END** - do NOT replace existing content
3. **Preserve ALL existing sessions** - they are the historical record of previous iterations

**Correct approach:**

```bash
# Read the file first to see existing content
cat plans/progress.txt

# Then append your new session (use >> not >)
cat >> plans/progress.txt << 'EOF'
================================================================================
SESSION: <date> (Iteration N)
...
EOF
```

**WRONG approach (DO NOT DO THIS):**

```bash
# NEVER overwrite the file like this:
cat > plans/progress.txt << 'EOF'   # WRONG - destroys history!
echo "..." > plans/progress.txt      # WRONG - destroys history!
```

If using a file write tool, you must include ALL existing content plus your new session.

**Your new session block should include:**

- Session metadata (date, iteration number, branch, feature)
- Pre-flight check results
- Feature selection rationale
- Implementation steps with results
- Gateway test results
- Verification (lint/types/tests)
- Completion summary with commit hash

## 10. Commit Your Work

**IMPORTANT:** All feature-related changes must be committed together in a single commit. This includes:

- Implementation code changes
- Updated `plans/prd.json` (with `passes: true`)
- Updated `plans/progress.txt` (with session documentation)

Create a descriptive commit on the ralph/autonomous branch:

```bash
# Stage ALL changes including progress.txt and prd.json
git add .

# Verify progress.txt and prd.json are staged
git status

git commit -m "<type>(<scope>): <description>

<optional body with more details>

Closes: <feature-id>"
```

Commit message types:

- `feat`: New feature implementation
- `fix`: Bug fix
- `test`: Adding tests
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `chore`: Maintenance tasks

Verify the commit:

```bash
git log -1
git show --stat
```

**CRITICAL:** Verify that `plans/progress.txt` and `plans/prd.json` are included in the commit output above. If they are missing, amend the commit to include them:

```bash
git add plans/progress.txt plans/prd.json
git commit --amend --no-edit
```

**DO NOT push to remote.** The branch will be pushed manually by the developer after reviewing the work.

## 11. Check for Completion

After updating the PRD, count remaining features:

```bash
# Check how many features remain
grep -c '"passes": false' plans/prd.json
```

**If ALL 37 features have `passes: true`:**

Output completion signal:

```
<promise>COMPLETE</promise>
```

This signals the Ralph loop to exit successfully. The branch push and PR creation will be handled manually by the developer after reviewing the work.

**If features remain (`passes: false`):**

- Exit cleanly (the loop will start your next iteration)

**On the next iteration, a fresh context window will start and implement the next feature on the same ralph/autonomous branch.**

**IMPORTANT:** Ralph should ONLY commit locally. Do NOT push to remote or create PRs - this is handled separately after human review.

---

## Constraints

**ONLY WORK ON A SINGLE FEATURE PER ITERATION.**

Do NOT:

- Work on multiple features in one iteration
- Mark features complete without running gateway tests
- Skip verification steps (lint/types/tests)
- Edit the PRD structure (only change `passes` values)
- Remove or modify feature definitions

---

## Completion Signal

If, after updating the PRD, you verify that ALL 37 features have `passes: true`, output:

```
<promise>COMPLETE</promise>
```

This signals the Ralph loop to exit successfully. Do NOT push or create PRs - this is handled separately.
