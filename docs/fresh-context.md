# Fresh Context Mechanism in Ralph

This document explains how Ralph ensures each iteration starts with a fresh context window, preventing context exhaustion and ensuring consistent performance.

---

## The Problem: Context Window Exhaustion

When AI agents work on complex tasks, they accumulate context:

- File reads
- Command outputs
- Intermediate reasoning
- Error messages
- Tool outputs

Eventually, the context window fills up, causing:

- ❌ Lost information (old context gets evicted)
- ❌ Degraded performance (too much noise)
- ❌ Inconsistent behavior (can't remember what was done)
- ❌ Failure to complete tasks (runs out of space mid-task)

---

## The Ralph Solution: Process Isolation

Ralph solves this by **starting each iteration as a completely new process** with zero context from previous runs.

### How It Works

#### 1. **Each Iteration = New Process**

```bash
for ((i=1; i<=MAX_ITERATIONS; i++)); do
  # Start NEW OpenCode process (fresh context)
  result=$(opencode -p "$(cat PROMPT.md)" --output-format text 2>&1)
  # Process exits here, releasing ALL context
done
```

**Key points:**

- Each `opencode` invocation is a **separate OS process**
- When the process exits, all context is freed
- The next iteration starts with a **completely empty context window**
- No memory carries over between iterations

#### 2. **State Persistence Through Git and Files**

Since context doesn't persist, Ralph uses the filesystem as "memory":

| What Persists      | How                  | Purpose                            |
| ------------------ | -------------------- | ---------------------------------- |
| **Code changes**   | Git commits          | Shows what was built               |
| **Progress notes** | `plans/progress.txt` | Documents decisions and outcomes   |
| **Feature status** | `plans/prd.json`     | Tracks which features are complete |
| **Test results**   | Git commit messages  | Records verification status        |

#### 3. **Agent Re-orientation on Each Iteration**

Every iteration starts with Step 1 in `PROMPT.md`:

```markdown
## 1. Get Your Bearings

Start every session by understanding the current state:

- Run `pwd` to confirm your working directory
- Run `git log --oneline -10` to see recent work
- Read @plans/progress.txt to understand what was done in previous iterations
- Read @plans/prd.json to see the full feature list
```

This forces the agent to:

1. ✅ Read git history to see what changed
2. ✅ Read progress.txt to understand context
3. ✅ Read prd.json to know what's left
4. ✅ Verify baseline tests pass

---

## How OpenCode Ensures Fresh Context

### OpenCode Architecture

OpenCode runs in **non-interactive mode** (`-p` flag):

```bash
opencode -p "$(cat PROMPT.md)" --output-format text
```

**What happens:**

1. OpenCode process starts
2. Reads the prompt file
3. Reads any attached files (`@plans/prd.json`, `@plans/progress.txt`)
4. Executes the task (implement one feature)
5. Outputs result to stdout
6. **Process exits and all memory is freed**

### Docker Sandbox Isolation (Recommended)

When using Docker sandboxes, isolation is even stronger:

```bash
docker sandbox run \
  --cpus 2.0 \
  --memory 4g \
  --pids-limit 100 \
  opencode \
  -p "$(cat PROMPT.md)" \
  --output-format text
```

**Additional guarantees:**

- Container starts fresh each time
- No shared state between containers
- Memory limits prevent resource leaks
- Container is destroyed after execution

---

## Verification: Is Context Really Fresh?

### Test 1: Memory Inspection

You can verify each iteration starts fresh by checking that the agent:

1. Always runs `pwd` and `git log` at the start
2. Reads `progress.txt` to understand what was done
3. Makes decisions based only on file state, not previous "memory"

### Test 2: Process ID Tracking

Each OpenCode invocation has a different process ID:

```bash
# Add this to ralph.sh for debugging
echo "OpenCode PID: $$"
```

If PIDs change between iterations → processes are isolated ✅

### Test 3: Deliberate Context Break

Try this experiment:

1. Run one iteration that implements feature A
2. In the next iteration, delete `progress.txt`
3. The agent should be confused (no memory of feature A)
4. This proves context doesn't carry over

---

## Benefits of Fresh Context

### ✅ 1. Consistent Performance

Each iteration performs the same:

- No degradation over time
- No "forgetting" important details
- Same quality on iteration 1 and iteration 20

### ✅ 2. Predictable Resource Usage

Context window usage is bounded:

- Reading git log: ~500 tokens
- Reading progress.txt: ~1000-2000 tokens
- Reading prd.json: ~5000 tokens
- Implementation: ~50,000-100,000 tokens
- **Total per iteration: ~60,000 tokens max**

This is far below most model limits (200k+ tokens).

### ✅ 3. Easy Debugging

If an iteration fails:

- Check the git commit (what was changed)
- Check progress.txt (what was attempted)
- Restart from last good commit
- No hidden state to debug

### ✅ 4. Parallelization Potential

Since iterations are independent, you could theoretically:

- Run multiple Ralph loops on different branches
- Merge the results
- This isn't implemented yet, but the architecture supports it

---

## Common Misconceptions

### ❌ "The agent remembers previous iterations"

**False.** Each iteration starts with zero memory. The agent only knows what's in:

- Git history
- `progress.txt`
- `prd.json`
- Current file state

### ❌ "Context carries over between iterations"

**False.** Each `opencode` invocation is a new process with a fresh context window.

### ❌ "Ralph uses conversation history"

**False.** Ralph doesn't use conversation history. It uses:

- File system state
- Git commits
- Progress log

---

## Advanced: Context Compaction (Not Used)

Some agent frameworks use **context compaction** to summarize old context and fit more into the window. Ralph **does not use this** because:

1. **Simpler:** Process isolation is easier to reason about
2. **More reliable:** No risk of summarization losing critical details
3. **Better performance:** Fresh context = fresh thinking
4. **Easier debugging:** All state is visible in files/git

---

## How This Differs From Other Agent Patterns

| Pattern                       | Context Handling                   | Pros                                   | Cons                                        |
| ----------------------------- | ---------------------------------- | -------------------------------------- | ------------------------------------------- |
| **Continuous conversation**   | One long conversation thread       | Simple, maintains context naturally    | Context window fills up, degrades over time |
| **Context compaction**        | Summarize old context periodically | Can run longer                         | Risk of losing important details, complex   |
| **Ralph (process isolation)** | Fresh process each iteration       | Consistent performance, easy debugging | Must re-read state each time                |

---

## Monitoring Context Health

Even though each iteration starts fresh, you should monitor:

### Signs of healthy iterations:

- ✅ Consistent commit quality
- ✅ Progress.txt entries are coherent
- ✅ Agent completes features in reasonable time
- ✅ Test pass rate stays high

### Signs of trouble:

- ❌ Agent repeatedly tries the same failed approach
- ❌ Progress.txt entries show confusion about state
- ❌ Agent makes commits that break tests
- ❌ Same feature attempted multiple times

If you see trouble, check:

1. Is `progress.txt` being updated properly?
2. Are git commits descriptive?
3. Is `prd.json` being updated correctly?
4. Are there uncommitted changes confusing the agent?

---

## Best Practices

### ✅ DO:

- Keep `progress.txt` detailed and up-to-date
- Write descriptive git commit messages
- Update `prd.json` immediately when features complete
- Ensure baseline tests pass before starting next iteration

### ❌ DON'T:

- Don't rely on "the agent remembering" from previous iterations
- Don't leave uncommitted changes between iterations
- Don't skip updating progress.txt
- Don't assume the agent "knows" something from earlier

---

## References

- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  - See section: "Getting up to speed"
- [Ralph Wiggum Technique](https://ghuntley.com/ralph/)
  - Core principle: "Each iteration is a fresh context window"

---

## FAQ

**Q: Why not use one continuous conversation?**
A: Continuous conversations eventually exhaust the context window. Fresh iterations scale to unlimited features.

**Q: Isn't re-reading git log/progress.txt wasteful?**
A: No. Reading these files uses ~2000 tokens, which is tiny compared to the ~200k token budget. The cost is worth the reliability.

**Q: Can I increase iteration count indefinitely?**
A: Yes! Each iteration is independent, so you can run 100, 1000, or more iterations. The 20 in `ralph.sh 20` is just a safety limit.

**Q: What if the agent forgets important context from progress.txt?**
A: That's why progress.txt should be detailed. If the agent misses something, improve the progress template to make it clearer.

**Q: Can I resume a Ralph loop after stopping it?**
A: Yes! Just run `ralph.sh` again. The agent will read progress.txt and prd.json to understand what's left to do.

---

**Summary:** Ralph ensures fresh context by running each iteration as a new process. State persists through git and files. This provides consistent performance and easy debugging across unlimited iterations.
