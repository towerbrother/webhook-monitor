# Development Workflows

Git conventions, pull request process, and development best practices.

## Table of Contents

- [Git Strategy](#git-strategy)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)

---

## Git Strategy

### Branching Model

**Main branch:** `main`

- Production-ready code
- Protected (no direct pushes when branch protection is enabled)
- All changes via pull requests

**Feature branches:**

- Format: `feature/description` or `feat/description`
- Example: `feature/webhook-retry-logic`

**Bug fix branches:**

- Format: `fix/description` or `bugfix/description`
- Example: `fix/queue-memory-leak`

**Other branch types:**

- `chore/`: Maintenance tasks (dependencies, cleanup)
- `docs/`: Documentation updates
- `refactor/`: Code refactoring without behavior changes

### Commit Message Convention

**Format:** Semantic commits (enforced by Renovate, recommended for all)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, config)
- `ci`: CI/CD changes

**Examples:**

```
feat(api): add webhook retry mechanism

Implement exponential backoff retry logic for failed webhook
deliveries. Max 5 retries with 2x backoff starting at 1 second.

Closes #123
```

```
fix(worker): prevent memory leak in job processor

Job results were not being cleared from memory after processing.
Added cleanup step in job completion handler.
```

```
chore(deps): update prisma to v5.8.0
```

**Scope:** Optional, indicates affected package or area

- `api`, `worker`, `web`, `db`, `queue`, `shared`

### When to Commit

**Commit frequency:**

- Small, logical units of work
- Each commit should leave codebase in working state
- One concern per commit

**What NOT to commit:**

- Broken code (fails build or tests)
- Commented-out code (remove instead)
- Debug statements (remove or use proper logging)
- Secrets or credentials (use environment variables)

### Git Workflow Example

```bash
# Create feature branch
git checkout -b feature/webhook-logging

# Make changes, commit frequently
git add apps/api/src/routes/webhooks.ts
git commit -m "feat(api): add webhook request logging"

# Keep branch up to date
git fetch origin
git rebase origin/main

# Push to remote
git push -u origin feature/webhook-logging

# Create pull request (via GitHub UI or gh CLI)
gh pr create --title "Add webhook request logging"
```

---

## Pull Request Process

### Before Creating PR

**Checklist:**

- ✅ All commits follow semantic commit format
- ✅ Code builds successfully (`pnpm build`)
- ✅ No linting errors (`pnpm lint`)
- ✅ No type errors (`pnpm check-types`)
- ✅ Tests pass (when tests exist)
- ✅ Branch is up to date with `main`

### Creating a Pull Request

**Via GitHub CLI (recommended):**

```bash
gh pr create --title "feat(api): add webhook retry logic" --body "$(cat <<'EOF'
## Summary

- Implements exponential backoff retry mechanism
- Adds configurable max retry attempts
- Updates webhook status tracking

## Testing

- Tested with failing webhook endpoints
- Verified retry logic with various failure scenarios
- Confirmed exponential backoff timing

## Related Issues

Closes #123
EOF
)"
```

**Via GitHub UI:**

1. Push your branch to GitHub
2. Navigate to repository
3. Click "Compare & pull request"
4. Fill out PR template (if exists)

### PR Title Format

Follow semantic commit convention:

```
feat(api): add webhook retry logic
fix(worker): resolve memory leak in job processor
chore(deps): update dependencies
docs: update deployment instructions
```

### PR Description Template

```markdown
## Summary

Brief description of changes (2-4 sentences or bullet points)

## Changes

- Specific change 1
- Specific change 2
- Specific change 3

## Testing

How were these changes tested?

## Screenshots (if applicable)

Before/after screenshots for UI changes

## Related Issues

Closes #123
Relates to #456
```

### PR Labels

**Automatically added:**

- `dependencies` - Renovate dependency updates
- `security` - Security vulnerability fixes

**Manually add:**

- `breaking-change` - Requires migration or breaking API change
- `enhancement` - New feature or improvement
- `bug` - Bug fix
- `documentation` - Documentation changes
- `needs-review` - Ready for review
- `work-in-progress` - Not ready for review

### PR Size Guidelines

**Ideal PR:**

- < 400 lines changed
- Single feature or fix
- Reviewable in < 30 minutes

**If PR is large:**

- Break into smaller PRs
- Use draft PR for early feedback
- Add detailed description and context

---

## Code Review Guidelines

### For Authors

**Before requesting review:**

- Self-review your own code
- Check diff for unintended changes
- Add comments for complex logic
- Update documentation if needed

**Responding to feedback:**

- Address all comments
- Mark resolved comments
- Push new commits (don't force push during review)
- Request re-review when ready

### For Reviewers

**What to review:**

**Correctness:**

- Does the code do what it's supposed to?
- Are there edge cases not handled?
- Could this introduce bugs?

**Code quality:**

- Is the code readable and maintainable?
- Are there clear variable/function names?
- Is the code properly structured?

**Architecture:**

- Does this follow project patterns?
- Are runtime boundaries respected (no cross-app imports)?
- Is shared code in the right place?

**Testing:**

- Are tests adequate (when tests exist)?
- Are edge cases covered?

**Documentation:**

- Are complex parts explained?
- Is public API documented?
- Is README updated if needed?

**Review checklist:**

- ✅ Code builds successfully
- ✅ No obvious bugs or edge cases
- ✅ Follows project architecture rules (per `AGENTS.md`)
- ✅ Code is readable and maintainable
- ✅ Tests are adequate (when applicable)
- ✅ Documentation is updated if needed

**Leaving feedback:**

**Constructive comments:**

```
❌ "This is bad"
✅ "Consider extracting this into a helper function for reusability"

❌ "Why did you do it this way?"
✅ "This approach works, but using X pattern would be more idiomatic"
```

**Use comment types:**

- **Blocking:** Must be addressed before merge
- **Nit/minor:** Optional improvement
- **Question:** Seeking clarification

**Approval criteria:**

- No blocking issues
- All questions answered
- Code meets quality standards

---

## Local Development

### Initial Setup

**Prerequisites:**

- Node.js >= 24.13.1 (per `package.json` engines requirement)
- pnpm 10.28.2 (exact version, enforced by `packageManager` field)
- PostgreSQL (local or remote)
- Redis (local or remote)

**Recommended:**

- Volta (automatic Node/pnpm version switching)
- PostgreSQL GUI (pgAdmin, TablePlus, etc.)

**Setup steps:**

```bash
# Clone repository
git clone git@github.com:towerbrother/webhook-monitor.git
cd webhook-monitor

# Install dependencies (pnpm will auto-install if using Volta)
pnpm install

# Set up environment variables
cp .env.example .env  # (when .env.example exists)
# Edit .env with your local database and Redis URLs

# Run database migrations
pnpm --filter @repo/db prisma migrate dev

# Generate Prisma client
pnpm --filter @repo/db prisma generate

# Start development servers
pnpm dev
```

### Development Commands

**Run all apps:**

```bash
pnpm dev  # Starts api, worker, and web in parallel
```

**Run specific app:**

```bash
pnpm --filter @repo/api dev      # API only
pnpm --filter @repo/worker dev    # Worker only
pnpm --filter @repo/web dev       # Web only
```

**Build:**

```bash
pnpm build           # Build all packages
pnpm --filter @repo/api build  # Build API only
```

**Linting:**

```bash
pnpm lint            # Lint all packages
pnpm --filter @repo/api lint   # Lint API only
```

**Type checking:**

```bash
pnpm check-types     # Check all packages
```

**Formatting:**

```bash
pnpm format          # Format all .ts, .tsx, .md files
```

### Database Operations

**Create migration:**

```bash
pnpm --filter @repo/db prisma migrate dev --name add_user_table
```

**Apply migrations:**

```bash
pnpm --filter @repo/db prisma migrate deploy
```

**Reset database (⚠️ destructive):**

```bash
pnpm --filter @repo/db prisma migrate reset
```

**Open Prisma Studio (DB GUI):**

```bash
pnpm --filter @repo/db prisma studio
```

### Workspace Operations

**Add dependency to specific package:**

```bash
pnpm --filter @repo/api add fastify-plugin
```

**Add dev dependency:**

```bash
pnpm --filter @repo/api add -D @types/node
```

**Add dependency to root:**

```bash
pnpm add -w prettier
```

**Remove dependency:**

```bash
pnpm --filter @repo/api remove package-name
```

---

## Troubleshooting

### Common Issues

#### Build Failures

**Error:** `Cannot find module '@repo/shared'`

**Solution:**

```bash
# Build dependencies first
pnpm build
```

**Reason:** Turborepo builds in dependency order, but may need clean build

---

**Error:** `Type error: Cannot find name 'X'`

**Solution:**

```bash
# Regenerate Prisma client
pnpm --filter @repo/db prisma generate

# Or rebuild all
pnpm build
```

---

#### Dependency Issues

**Error:** `Lockfile is outdated`

**Solution:**

```bash
pnpm install
```

---

**Error:** `ERR_PNPM_OUTDATED_LOCKFILE`

**Solution:**

```bash
# Delete lock file and reinstall
rm pnpm-lock.yaml
pnpm install
```

---

#### Database Issues

**Error:** `Can't reach database server`

**Solution:**

1. Check PostgreSQL is running: `psql -U postgres`
2. Verify DATABASE_URL in `.env`
3. Check PostgreSQL logs for errors

---

**Error:** `Migration failed: relation already exists`

**Solution:**

```bash
# Reset database (⚠️ deletes all data)
pnpm --filter @repo/db prisma migrate reset

# Or manually drop tables and re-migrate
```

---

#### Redis Issues

**Error:** `ECONNREFUSED 127.0.0.1:6379`

**Solution:**

1. Check Redis is running
2. Start Redis: `redis-server` (macOS/Linux) or via services (Windows)
3. Verify REDIS_URL in `.env`

---

### Port Conflicts

**Default ports:**

- API: 3000
- Web: 3001
- Database: 5432
- Redis: 6379

**Solution:** Change port in app's `.env` or config file

---

### Performance Issues

**Slow installs:**

```bash
# Clear pnpm cache
pnpm store prune

# Reinstall
pnpm install
```

**Slow builds:**

```bash
# Clear Turbo cache
rm -rf .turbo

# Clean node_modules
pnpm clean  # (if script exists)
pnpm install
```

---

### Getting Help

**Resources:**

- Project documentation: `docs/` directory
- Architecture rules: `AGENTS.md`
- Package documentation: Check package-specific READMEs

**Reporting issues:**

1. Check existing issues on GitHub
2. Search documentation
3. Create new issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, pnpm version)

---

## Best Practices

### Code Organization

**Follow monorepo structure:**

- Runtime code in `apps/`
- Shared code in `packages/`
- No cross-app imports (use `packages/` for sharing)

**File naming:**

- `kebab-case` for file names
- `PascalCase` for components and classes
- `camelCase` for functions and variables

### Performance

**Avoid:**

- Heavy computations in API routes (use worker)
- N+1 database queries (use Prisma includes)
- Unnecessary re-renders in React

**Optimize:**

- Use database indexes for frequent queries
- Cache expensive computations
- Lazy-load heavy dependencies

### Security

**Never commit:**

- API keys or secrets
- `.env` files
- Database credentials
- Personal information

**Always:**

- Validate user input
- Use parameterized queries (Prisma does this)
- Rate limit API endpoints
- Sanitize error messages (don't leak internals)

---

## Related Documents

- [Automation](./automation.md) - CI/CD and Renovate configuration
- [Infrastructure](./infrastructure.md) - Deployment and operations
- [`AGENTS.md`](../AGENTS.md) - Architecture and coding rules
