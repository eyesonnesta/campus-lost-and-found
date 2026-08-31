# Contributing to PataTena

Thank you for helping improve PataTena.

## Before opening a change

1. Keep work within the approved Version 1 requirements.
2. Open a proposal before adding a feature, integration, role, table, dependency, or workflow.
3. Never commit credentials, private evidence, user contact details, or production data.
4. Keep changes focused and include tests for changed behavior.

## Development checks

Run the complete local quality suite before opening a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run relevant Playwright tests for user-facing workflow changes.

## Commit quality

Use concise commit messages that describe the concrete outcome. Do not mix unrelated refactors or formatting changes into feature commits.
