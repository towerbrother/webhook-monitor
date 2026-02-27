@plans/prd.json @plans/progress.txt

# Ralph Wiggum Coding Loop - Iteration Instructions

You are working in an autonomous coding loop with a **FRESH CONTEXT WINDOW**. You have NO memory of previous iterations. Your goal is to make incremental progress on ONE feature, leave the codebase in a clean state, and document your work for the next iteration.

## Context Window Isolation

**IMPORTANT:** Each iteration starts with a completely fresh context:

- You have zero memory from previous iterations
- You must read `progress.txt` and `git log` to understand what was done
- The codebase state (files, git history) is your only source of truth
- This ensures consistent performance across many iterations

## 1. Get Your Bearings

Start every session by understanding the current state:

- Run `pwd` to confirm your working directory
- Run `git branch --show-current` to verify you're on `ralph/autonomous`
- Run `git status` to check for uncommitted changes
- Run `git log --oneline -10` to see recent work
- Read @plans/progress.txt to understand what was done in previous iterations
- Read @plans/prd.json to see the full feature list

**CRITICAL:** You should ALWAYS be on branch `ralph/autonomous`. If not, stop and investigate.

## 2. Select the Highest-Priority Feature

Choose ONE feature to work on using these criteria:

**ONLY select features where:**

- `passes: false` (not yet complete)
- ALL dependencies have `passes: true` (dependencies satisfied)

**Prioritize by:**

1. Category order: functional > security > operational > infrastructure > testing > validation > frontend
2. Within same category, choose the feature that unblocks the most downstream dependencies
3. If tied, choose the feature with fewer implementation steps (lower complexity)

**Document your selection rationale** in progress.txt explaining why you chose this feature.

## 3. Verify Baseline Health

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

## 4. Implement the Feature

Follow the feature's `steps` array from prd.json:

- Work through each step methodically
- Document each step in progress.txt with timestamp, files modified, and result
- If you encounter blockers, document them and consider selecting a different feature

## 5. Verify with Gateway Tests

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

- Debug and fix the issue
- Re-run ALL gateway tests
- Do NOT mark the feature complete until all tests pass

## 6. Run Full Test Suite

After implementation and gateway tests:

```bash
pnpm lint        # Must pass
pnpm check-types # Must pass
pnpm test        # Must pass
```

All checks must be green before proceeding.

## 7. Update the PRD

In @plans/prd.json, update ONLY the `passes` field for your feature:

```json
{
  "id": "your-feature-id",
  "passes": true // Change false → true
}
```

**CRITICAL:** Do NOT edit any other fields. Do NOT remove features. Do NOT modify descriptions, steps, or gatewayTests.

## 8. Document Your Progress

Append to @plans/progress.txt following the template structure:

- Session metadata (time, branch, working directory)
- Pre-flight check results
- Feature selection rationale
- Implementation steps with results
- Gateway test results
- Verification (lint/types/tests)
- Completion summary
- Notes for next session

## 9. Commit Your Work

Create a descriptive commit on the ralph/autonomous branch:

```bash
git add .
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

**DO NOT push to remote.** The branch will be pushed at the end when all features are complete.

## 10. Check for Completion

After updating the PRD, count remaining features:

```bash
# Check how many features remain
grep -c '"passes": false' plans/prd.json
```

**If ALL 37 features have `passes: true`:**

1. Push the branch to remote:

   ```bash
   git push -u origin ralph/autonomous
   ```

2. Create ONE final PR with all 37 features:

   ```bash
   gh pr create \
     --title "feat: implement all 37 webhook-monitor features" \
     --body "$(cat <<'EOF'
   ## Summary

   Autonomous implementation of all 37 features from the PRD:

   ### Functional Features (Core webhook system)
   - <list all functional feature IDs and brief descriptions>

   ### Security Features
   - <list all security feature IDs and brief descriptions>

   ### Operational Features
   - <list all operational feature IDs and brief descriptions>

   ### Infrastructure Features
   - <list all infrastructure feature IDs and brief descriptions>

   ### Testing Features
   - <list all testing feature IDs and brief descriptions>

   ### Validation Features
   - <list all validation feature IDs and brief descriptions>

   ### Frontend Features
   - <list all frontend feature IDs and brief descriptions>

   **All tests passing:** Yes
   **Total commits:** <count commits on ralph/autonomous>
   **Branch:** ralph/autonomous
   EOF
   )" \
     --assignee @me
   ```

3. Output completion signal:
   ```
   <promise>COMPLETE</promise>
   ```

**If features remain (`passes: false`):**

- Exit cleanly (the loop will start your next iteration)
- Do NOT push or create PR yet

**On the next iteration, a fresh context window will start and implement the next feature on the same ralph/autonomous branch.**

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

If, after updating the PRD, you verify that ALL 37 features have `passes: true`, follow step 10 above to push the branch, create the final PR, and output:

```
<promise>COMPLETE</promise>
```

This signals the Ralph loop to exit successfully.
