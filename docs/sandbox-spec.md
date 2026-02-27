# OpenCode Sandbox Specification for Ralph Loops

This document defines the security and isolation requirements for running autonomous coding agents (Ralph loops) on the webhook-monitor project.

## Overview

The Ralph Wiggum technique runs AI coding agents in a loop, allowing them to make autonomous code changes, run tests, and commit to the repository. To do this safely, we use sandboxed execution environments that isolate the agent's operations from the host system.

## Execution Environment

### Recommended Setup: Docker Sandbox

Based on [Anthropic's best practices](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) and the [Ralph Wiggum guide](https://www.aihero.dev/getting-started-with-ralph), we recommend using Docker Desktop 4.50+ sandboxes for OpenCode execution.

**Installation:**

```bash
# Install Docker Desktop 4.50+
# https://docs.docker.com/desktop/install

# Run OpenCode in sandbox
docker sandbox run opencode -p "$(cat plans/PROMPT.md)" --output-format text
```

### Alternative Setup: Direct Execution with Restrictions

If Docker sandboxes are not available, OpenCode can run directly on the host with the following restrictions enforced via wrapper scripts.

---

## Container Configuration

When using Docker sandboxes:

| Resource   | Limit                  | Rationale                                                               |
| ---------- | ---------------------- | ----------------------------------------------------------------------- |
| **CPU**    | 2 cores                | Sufficient for compilation and test runs without hogging host resources |
| **Memory** | 4GB RAM                | Adequate for Node.js, TypeScript compilation, and test suites           |
| **Swap**   | 4GB                    | Prevent OOM kills during large builds                                   |
| **PIDs**   | 100 processes          | Prevent fork bombs while allowing parallel test execution               |
| **Disk**   | Project workspace only | Isolated to prevent host filesystem access                              |

**Example Docker Run:**

```bash
docker sandbox run \
  --cpus 2.0 \
  --memory 4g \
  --memory-swap 4g \
  --pids-limit 100 \
  opencode \
  -p "$(cat plans/PROMPT.md)" \
  --output-format text
```

---

## File System Isolation

### Allowed Access

- **Workspace:** `C:\Users\th-g.torre\Desktop\Repos\webhook-monitor` (or equivalent)
  - Mounted at the same path inside container for git compatibility
  - Read/write access to all files within workspace
- **Temporary Files:** `/tmp` limited to 1GB
  - Cleared between iterations

### Blocked Access

- ❌ No access to parent directories (`..\..`, `/home`, `/Users`, etc.)
- ❌ No access to system directories (`/etc`, `/bin`, `/usr`, etc.)
- ❌ No access to other projects or sensitive host files
- ❌ No mounting of host Docker socket (no docker-in-docker)

### Git Configuration

Git identity must be injected from host to ensure proper commit attribution:

```bash
# Auto-injected by Docker sandboxes
git config user.name "$(git config user.name)"
git config user.email "$(git config user.email)"
```

---

## Network Isolation

### Allowed Outbound Connections

Whitelist only essential services:

| Service           | Domain/IP                      | Purpose                         |
| ----------------- | ------------------------------ | ------------------------------- |
| **npm registry**  | `registry.npmjs.org`           | Package installation            |
| **pnpm registry** | `registry.npmjs.org`           | Package installation            |
| **GitHub**        | `github.com`, `api.github.com` | Git operations, gh CLI          |
| **Localhost**     | `127.0.0.1`, `localhost`       | Development servers for testing |
| **OpenCode API**  | `api.opencode.ai` (if needed)  | OpenCode API calls              |

### Blocked Connections

- ❌ No SSH to external servers
- ❌ No telnet, netcat, or raw socket connections
- ❌ No access to internal/private networks (except localhost)
- ❌ No FTP or other legacy protocols

### Inbound Connections

- ✅ Allow connections on ports 3000-9999 (development servers)
- ❌ Block all other inbound connections

---

## Command Restrictions

### Allowed Operations

**Package Management:**

```bash
✅ pnpm install        # Install dependencies from lock file
✅ pnpm add <package>  # Add new dependency
✅ pnpm test           # Run tests
✅ pnpm build          # Build project
✅ pnpm lint           # Lint code
✅ pnpm check-types    # TypeScript type checking
```

**Git Operations:**

```bash
✅ git status          # Check repository status
✅ git log             # View commit history
✅ git diff            # View changes
✅ git add             # Stage changes
✅ git commit          # Create commits
✅ git push            # Push to remote
✅ git checkout        # Switch branches
✅ git branch          # Manage branches
```

**Development Servers:**

```bash
✅ pnpm dev            # Start development servers
✅ curl                # HTTP requests for testing
✅ node                # Run Node.js scripts
```

**File Operations:**

```bash
✅ cat, head, tail     # Read files
✅ echo, printf        # Output text
✅ mkdir, touch        # Create directories/files
✅ cp, mv              # Copy/move files (within workspace)
✅ rm                  # Delete files (within workspace)
```

### Blocked Operations

**System Modification:**

```bash
❌ sudo, su            # No privilege escalation
❌ apt, yum, brew      # No system package managers
❌ systemctl           # No service management
❌ modprobe, insmod    # No kernel modules
❌ mount, umount       # No filesystem mounting
```

**Dangerous Commands:**

```bash
❌ rm -rf / *          # Patterns that could delete critical files
❌ dd                  # Raw disk operations
❌ mkfs                # Filesystem creation
❌ fdisk, parted       # Disk partitioning
```

**Network Tools (unless explicitly needed):**

```bash
❌ nc, netcat          # Raw socket connections
❌ telnet              # Legacy protocol
❌ ssh                 # Remote shell access (use git over HTTPS)
❌ wget, curl to internal IPs  # Prevent SSRF
```

**Docker Operations:**

```bash
❌ docker              # No docker-in-docker
❌ docker-compose      # No container orchestration from inside sandbox
```

---

## Environment Variables

### Allowed Variables

Only inject non-sensitive configuration:

```bash
✅ NODE_ENV=development
✅ PNPM_HOME=/workspace/.pnpm
✅ PATH=/usr/local/bin:/usr/bin:/bin
✅ LOG_LEVEL=info
```

### Blocked Variables

**Never mount or expose:**

```bash
❌ DATABASE_URL (production)
❌ API_KEY (production)
❌ SECRET_KEY
❌ AWS_SECRET_ACCESS_KEY
❌ OPENCODE_API_KEY (host key)
❌ GITHUB_TOKEN (personal)
❌ Any production credentials
```

**For Testing:**

Use test-specific values or mock services:

```bash
✅ DATABASE_URL=postgresql://localhost:5432/webhook_monitor_test
✅ REDIS_URL=redis://localhost:6379/1
```

---

## Monitoring and Logging

### Required Logging

Every Ralph iteration must log:

1. **Command Execution:** All shell commands run by the agent
2. **File Changes:** Files created, modified, or deleted
3. **Network Requests:** Outbound HTTP/HTTPS connections
4. **Resource Usage:** CPU, memory, disk usage per iteration
5. **Exit Codes:** Success/failure status of all operations

**Log Location:**

```
logs/ralph-YYYYMMDD-HHMMSS.log
```

### Alerting Thresholds

Trigger warnings or halt execution if:

| Condition     | Threshold          | Action                         |
| ------------- | ------------------ | ------------------------------ |
| Memory usage  | >90%               | Warn, consider cleanup         |
| CPU sustained | >80% for >5min     | Warn, check for infinite loops |
| Disk usage    | >95%               | Halt, clean build artifacts    |
| No commits    | 3 iterations       | Warn, agent may be stuck       |
| Error rate    | >50% of iterations | Halt, review prompts           |

---

## Security Best Practices

### Secret Management

1. **Never commit secrets:** Use `.env.example` with placeholder values
2. **Git hooks:** Install pre-commit hooks to detect secrets
3. **Review commits:** Human review of all commits before push (optional)

### Code Review

While Ralph commits autonomously, consider:

1. **Branch strategy:** Each feature on a separate branch
2. **Pull requests:** Create PRs for human review before merging
3. **CI/CD:** All PRs must pass automated tests

### Incident Response

If the agent behaves unexpectedly:

1. **Halt immediately:** Kill the Ralph loop process
2. **Review logs:** Check `logs/ralph-*.log` for errors
3. **Inspect changes:** `git diff` to see what was modified
4. **Revert if needed:** `git reset --hard <last-good-commit>`
5. **Update prompts:** Refine `PROMPT.md` to prevent recurrence

---

## Recovery Procedures

### Container Crashes

If the Docker sandbox crashes:

1. Restart from last git commit
2. Verify baseline health (`pnpm test`, `pnpm check-types`)
3. Resume Ralph loop with remaining iterations

### Disk Space Issues

If disk fills up:

```bash
# Clean build artifacts
pnpm clean
rm -rf node_modules/.cache
rm -rf apps/**/dist
rm -rf apps/**/.next

# Re-install and retry
pnpm install
```

### Network Failures

If network becomes unavailable:

1. Retry with exponential backoff (max 3 attempts)
2. If persistent, halt and alert
3. Resume after network restored

### Stuck Agent

If agent makes no progress for 3+ iterations:

1. Review `plans/progress.txt` for patterns
2. Check if feature has unmet dependencies
3. Manually fix blocking issue
4. Update PRD if feature is infeasible
5. Resume loop

---

## Testing the Sandbox

Before running autonomous loops, verify the sandbox works:

```bash
# Test 1: File isolation
docker sandbox run opencode -p "Try to read /etc/passwd" --output-format text
# Expected: Should fail or return error

# Test 2: Network restrictions
docker sandbox run opencode -p "Try to SSH to example.com" --output-format text
# Expected: Should fail (SSH not available or blocked)

# Test 3: Resource limits
docker sandbox run opencode -p "Run a CPU-intensive task" --output-format text
# Expected: Should respect CPU/memory limits

# Test 4: Git operations
docker sandbox run opencode -p "Run git status" --output-format text
# Expected: Should work and show repository status
```

---

## References

- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [AI Hero: Getting Started with Ralph](https://www.aihero.dev/getting-started-with-ralph)
- [Docker Sandboxes Documentation](https://docs.docker.com/ai/sandboxes/)
- [Ralph Wiggum Technique](https://ghuntley.com/ralph/)

---

## Changelog

| Date       | Change                        | Author         |
| ---------- | ----------------------------- | -------------- |
| 2026-02-27 | Initial sandbox specification | OpenCode Agent |
