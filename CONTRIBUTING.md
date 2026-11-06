# Contributing to Folio AM

Start with a GitHub issue describing the behavior or integration you want to improve. Work on a feature branch and open a pull request with the problem, change, and validation.

Use Node 22 or newer. Run `npm ci`, `npm test`, and `npm run format:check`. For Worker or storage changes, also run `npm run test:runtime` and `npm run build` (a deployment dry run).

Keep integrations replaceable and read-only by default. Add tests for authorization, retries, normalization and failure cases when changing those behaviors. Use fictional fixtures. Never include inbox contents, tokens, local state, or real customer data in issues, screenshots or commits. Distinguish implemented integrations from roadmap items.

By contributing, you agree your contributions are made under the project's MIT license. Retain the Max Palmer copyright notice and Framework Systematics attribution. This developer preview does not include tested hardware acceptance, consumer OAuth onboarding, or a managed service.
