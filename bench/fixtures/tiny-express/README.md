# tiny-express

Synthetic fixture for the pi-pro eval. A minimal Express app with:

- `GET /api/users` — returns 2 users **with** `passwordHash` leaked (the bug for the security task)
- `GET /api/parse-input` — duplicated helper logic (the refactor task)
- (no `/healthz` — that's the add-feature task)

Tasks that target this fixture:

1. **refactor-helper** — extract the parse-input parsing into a shared helper module
2. **add-healthz** — add a `/healthz` endpoint that returns `{ status: 'ok' }` with 200
3. **fix-bug-auth** — strip `passwordHash` from `/api/users` responses

Run tests: `npm test`
