# Contributing Guidelines

## General Behavior

- **Prefer deletion over addition** – Remove unused code, dependencies, and files
- **Do not introduce new tools or frameworks** unless explicitly requested
- **Do not refactor unrelated code** – Stay focused on the task
- **Do not "improve" things that were not asked for** – No premature optimization
- **Update documentation if behavior changes** – Keep README.md and comments current

## Git Commits

- **Atomic changes** – Each commit should leave the codebase in a working state
- **Descriptive commit messages** – Explain why, not what

## Documentation

- **Update README.md** if scripts or structure change
- **Update AGENTS.md** if patterns or rules change
- **Add JSDoc comments** for public APIs
- **Environment variables** – Document in .env.example files

## Configuration

- **Shared configs** – Use packages/eslint-config and packages/typescript-config
- **Environment variables** – Use .env files, document all variables
