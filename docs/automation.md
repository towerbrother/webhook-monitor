# Automation

Automated processes for dependency management, continuous integration, and quality assurance.

## Table of Contents

- [Dependency Management (Renovate)](#dependency-management-renovate)
- [Continuous Integration (GitHub Actions)](#continuous-integration-github-actions)
- [Branch Protection](#branch-protection)
- [Automated Quality Checks](#automated-quality-checks)

---

## Dependency Management (Renovate)

### Overview

Renovate Bot automatically manages dependencies across our pnpm monorepo, creating pull requests for updates while maintaining stability through conservative automation.

**Configuration:** [`renovate.json`](../renovate.json)

### Control Level: Conservative

**Rationale:**

- Production system requires stability over bleeding-edge updates
- Manual review ensures breaking changes don't slip through
- Auto-merge only low-risk patches to balance automation with safety

### Auto-merge Rules

| Update Type | Dependency Type   | Action           | Rationale                          |
| ----------- | ----------------- | ---------------- | ---------------------------------- |
| Patch       | `devDependencies` | ✅ Auto-merge    | Low-risk, non-runtime changes      |
| Minor       | `devDependencies` | 👀 Manual review | May introduce new features/changes |
| Major       | Any               | 👀 Manual review | Potential breaking changes         |
| Any         | `dependencies`    | 👀 Manual review | Affects production runtime         |
| Security    | Any               | 🚨 Immediate PR  | Bypass schedule, review urgently   |

### Package Grouping Strategy

Dependencies are grouped by ecosystem to reduce PR noise and enable coherent testing:

| Group              | Packages              | Rationale                                   |
| ------------------ | --------------------- | ------------------------------------------- |
| `pnpm`             | Package manager       | Critical infrastructure, isolated testing   |
| `turborepo`        | Build orchestration   | Affects entire build pipeline               |
| `typescript`       | Language + Node types | Language updates need comprehensive testing |
| `eslint packages`  | Linting ecosystem     | May introduce new lint errors               |
| `prisma`           | ORM + client          | Database layer needs migration testing      |
| `queue packages`   | BullMQ + ioredis      | Background job infrastructure               |
| `fastify packages` | API framework         | Backend framework updates                   |
| `next.js`          | Web framework         | Frontend framework updates                  |
| `react`            | UI library + types    | React ecosystem updates together            |

**Benefits:**

- Reduces cognitive load (review related packages together)
- Prevents version conflicts within ecosystems
- Enables targeted testing per technology stack

### Schedule Configuration

```json
"schedule": ["before 10am on monday"],
"timezone": "UTC"
```

**Rationale:**

- **Monday morning:** Start of work week, time to address issues
- **Weekly cadence:** Balances freshness with stability
- **Exception:** Security vulnerabilities bypass schedule

### Rate Limiting

```json
"prConcurrentLimit": 5,
"prHourlyLimit": 2
```

**Purpose:**

- Prevents overwhelming PR queue
- Maintains manageable review workload
- Avoids CI/CD resource saturation

### Lock File Maintenance

**Schedule:** First day of each month at 10am UTC

**Purpose:**

- Deduplicates dependencies in `pnpm-lock.yaml`
- Removes orphaned entries
- Optimizes install times

### Node.js Version Enforcement

```json
"allowedVersions": ">=22.0.0 <23.0.0"
```

**Rationale:**

- Aligns with `package.json` engines requirement
- Prevents untested major version upgrades
- Ensures consistency with Volta configuration

### Assignment Strategy

**Approach:** GitHub CODEOWNERS (`.github/CODEOWNERS`)

**Rationale:**

- Automatic assignment without hardcoding usernames in config
- Centralized ownership definitions
- Works across all automated PRs

### Monitoring Tasks

**Weekly:**

- Review Renovate PRs (typically 2-5 per week)
- Merge auto-mergeable patches (automated)
- Test and merge manual-review updates

**Monthly:**

- Review lock file maintenance PR
- Check Renovate dashboard for stalled updates

**Immediate (on security alerts):**

- Review security vulnerability PRs
- Deploy fixes as soon as possible

### Customization Examples

#### Make more aggressive (auto-merge minors):

```json
{
  "matchDepTypes": ["devDependencies"],
  "matchUpdateTypes": ["patch", "minor"],
  "automerge": true
}
```

#### Change schedule to weekends:

```json
"schedule": ["every weekend"]
```

#### Disable specific packages:

```json
{
  "matchPackageNames": ["problematic-package"],
  "enabled": false
}
```

---

## Continuous Integration (GitHub Actions)

**Status:** Planned

### Technology Choice

**Platform:** GitHub Actions

**Rationale:**

- Native GitHub integration (no external service)
- Free for public repos, generous limits for private
- Matrix builds for monorepo packages
- Built-in cache support for pnpm and Turborepo

### Planned Workflow

**File:** `.github/workflows/ci.yml`

**Triggers:**

- Pull requests to `main`
- Pushes to `main`
- Manual workflow dispatch

### Pipeline Jobs

#### 1. Lint

```yaml
- Run: pnpm lint
- Cache: Turborepo cache + node_modules
- Fast fail: Yes
```

**Purpose:** Catch code style and quality issues early

#### 2. Type Check

```yaml
- Run: pnpm check-types
- Cache: Turborepo cache + node_modules
- Fast fail: Yes
```

**Purpose:** TypeScript compilation checks across monorepo

#### 3. Build

```yaml
- Run: pnpm build
- Cache: Turborepo cache + node_modules
- Artifacts: Built packages for deployment
```

**Purpose:** Verify all packages build successfully

#### 4. Test (when tests are added)

```yaml
- Run: pnpm test
- Coverage: Upload to Codecov
- Cache: Turborepo cache + node_modules
```

**Purpose:** Run unit and integration tests

### Caching Strategy

| Cache Target    | Key                   | Purpose                |
| --------------- | --------------------- | ---------------------- |
| pnpm store      | `pnpm-lock.yaml` hash | Cache npm dependencies |
| Turborepo cache | `.turbo/` directory   | Cache build outputs    |
| Node modules    | `pnpm-lock.yaml` hash | Speed up installs      |

**Expected speedup:** 60-80% reduction in CI time after first run

### Parallel Execution

Jobs run in parallel when possible:

- Lint, type-check, and build run simultaneously
- Turborepo respects internal package dependencies
- Failure in any job fails the entire workflow

### Matrix Strategy

```yaml
strategy:
  matrix:
    node-version: [22.x]
```

**Rationale:** Single Node.js version per project requirements (v22+)

**Future consideration:** Add matrix for multiple platforms (Linux, Windows) if needed

---

## Branch Protection

**Status:** Recommended (not yet implemented)

### Configuration

**GitHub → Settings → Branches → Add rule for `main`:**

#### Required Settings

- ✅ **Require pull request before merging**
  - Prevents direct pushes to production branch
- ✅ **Require status checks to pass before merging**
  - Required checks: `build`, `lint`, `check-types`, `test`
  - Ensures all code passes automated checks
- ✅ **Require branches to be up to date before merging**
  - Prevents stale branches from merging
- ✅ **Require linear history**
  - Maintains clean git history
  - No merge commits allowed (rebase or squash only)

#### Disabled Settings

- ❌ **Allow force pushes:** Disabled
  - Protects against accidental history rewrites
- ❌ **Allow deletions:** Disabled
  - Protects main branch from deletion

### Auto-merge Compatibility

For Renovate auto-merge to work with branch protection:

1. ✅ All required status checks must pass
2. ✅ Branch must be up to date
3. ✅ No conflicting reviews

**Recommendation:** Enable GitHub Actions CI before enabling auto-merge

---

## Automated Quality Checks

### Current Checks

**Configured via npm scripts:**

```json
"lint": "turbo lint",         // ESLint across monorepo
"check-types": "turbo check-types",  // TypeScript checks
"build": "turbo build",        // Build verification
"format": "prettier --write"   // Code formatting
```

### Linting (ESLint)

**Configuration:** `packages/eslint-config/`

**Key features:**

- All errors treated as warnings (dev-friendly via `eslint-plugin-only-warn`)
- ESLint flat config format (ESLint 9.x)
- Three configs: `base` (backend), `next` (Next.js), `react-internal` (React libraries)
- Turbo env var checking (warns about undeclared environment variables)

### Type Checking (TypeScript)

**Configuration:** `packages/typescript-config/`

**Key features:**

- Strict mode enabled (no implicit any, strict null checks)
- `noUncheckedIndexedAccess: true` (safer array/object access)
- Target: ES2022 (modern JavaScript)
- Module system: ESM
- Backend: NodeNext resolution
- Frontend: Bundler resolution

### Code Formatting (Prettier)

**Configuration:** Root `.prettierrc` (if exists) or defaults

**Key features:**

- 80 character line width
- Consistent formatting across `.ts`, `.tsx`, `.md` files
- Run via `pnpm format` before commits

### Testing (When Added)

**Recommended framework:** Vitest (per `AGENTS.md`)

**Test structure:**

- Co-located tests: `src/foo.ts` → `src/foo.test.ts`
- Run single test: `pnpm test -- path/to/file.test.ts`
- Watch mode: `pnpm test --watch`

**Coverage requirements (proposed):**

- Critical paths: 80%+ coverage
- Infrastructure code: 60%+ coverage

---

## Future Enhancements

### Pre-commit Hooks (Husky + lint-staged)

**Status:** Not yet implemented

**Planned checks:**

- Run Prettier on staged files
- Run ESLint on staged files
- Run type-check on affected packages

**Benefits:**

- Catch issues before pushing
- Faster feedback loop
- Reduces CI failures

### Automated Dependency Security Scanning

**Options to consider:**

- **Dependabot:** GitHub's built-in security alerts
- **Snyk:** Deep vulnerability analysis
- **Socket.dev:** Supply chain security

**Current:** Renovate security alerts (enabled)

### Automated Performance Testing

**When to add:**

- Load testing for API endpoints
- Bundle size tracking for web app
- Database query performance regression testing

---

## Related Documents

- [Infrastructure](./infrastructure.md) - Deployment and operational concerns
- [Workflows](./workflows.md) - Git and PR workflows
- [`renovate.json`](../renovate.json) - Renovate configuration
- [`AGENTS.md`](../AGENTS.md) - Architecture and coding rules
