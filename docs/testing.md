# Testing

## Framework

- **Vitest** for all testing
- **Test files** – Place adjacent to source: `src/foo.ts` → `src/foo.test.ts`

## Commands

```bash
# Run all tests
pnpm test

# Run single test file
pnpm test -- path/to/file.test.ts

# Watch mode
pnpm test:watch
```

## Testing Philosophy

- **Test real usage patterns** – Tests should mirror how the code is actually used in production
- **No tests for the sake of testing** – Don't test trivial getters, setters, or obvious code
- **Focus on behavior, not implementation** – Test what the code does, not how it does it
- **Test critical paths first** – Prioritize business logic, edge cases, and error handling
- **Integration over unit when appropriate** – Test realistic scenarios with real dependencies when it makes sense

## Coverage

- Coverage reports not yet configured
- When added, aim for critical paths first (not 100% coverage)
- High coverage is not the goal – testing real usage is
