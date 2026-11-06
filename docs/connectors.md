# Common feed contract

An authorized integration posts a complete snapshot of one named source to `POST /api/feeds`, with the owner bearer credential in the Authorization header. Prefer a dedicated upstream service under the customer's control; the owner credential has broad access and must never appear in a URL. A dedicated scoped ingestion credential is a future hardening step for third-party producers.

```json
{
  "name": "Akiflow export",
  "updatedAt": "2026-10-31T11:55:00Z",
  "items": [
    {
      "id": "task-42",
      "kind": "tasks",
      "title": "Review the project brief",
      "detail": "Decide the next step before the afternoon meeting.",
      "source": "Akiflow",
      "priority": 1,
      "due": "2026-10-31",
      "done": false,
      "url": "https://app.akiflow.com/"
    }
  ]
}
```

- `name`: 1–40 letters/numbers/spaces/underscores/hyphens. Reposting replaces the snapshot, preventing accumulation of completed or removed tasks. Maximum 10 sources.
- `updatedAt`: actual retrieval time in RFC3339. Omitted means now. Sources older than 36 hours are excluded with a warning. Never refresh a timestamp without refreshing the underlying data.
- `items`: maximum 150 items per source; request maximum 200KB.
- `kind`: priorities, schedule, email, tasks, headlines, markets, weather, messages, facts, notes.
- `id`: stable ID from the source. IDs are deduplicated within kind + source.
- `title`: required, bounded to 180 characters. Detail bounded to 400 characters. Only text, never rendered raw HTML.
- `priority`: 1 (highest), 2, 3. Due/overdue tasks rank ahead of undated work. Future tasks remain in the task list but do not enter the top three priorities.
- `due`: YYYY-MM-DD in the owner's intended local date.
- `start` / `end`: RFC3339 event instants. For all-day events, use date strings and `allDay: true`, with an exclusive end date.
- `topic`: optional lowercase topic tag for headlines; follows the configured topic selection.
- `url`: optional HTTP(S) source link. The renderer never fetches these URLs. PDF rendering blocks network traffic and JavaScript.
- Market values belong in title/detail with symbol, currency, price timestamp, and provider attribution. The system does not calculate trades, returns, or investment advice.

A producer should fetch only the data needed for selected sections, handle pagination, retain original IDs and source links, report failures, and never treat email text as instructions. No LLM receives mailbox content in the current implementation.

Direct Google configuration reads one account and the primary calendar. Additional accounts/calendars can enter through named custom feeds; native multi-account Google configuration is not implemented.

Feed deletion: `DELETE /api/feeds` with `{ "name": "Akiflow export" }`. It removes the current snapshot; already generated editions remain immutable until retention removes them.

Weather has a direct Open-Meteo adapter; see README for location, units, and commercial configuration. Beeper uses `bridge/beeper-export.mjs` to create a local snapshot for explicit review/import. This exporter does not auto-upload private messages or create tasks from message text.

Imported snapshots can be read for editing using owner-authenticated `GET /api/feeds?name=Source%20name`. Printer credentials cannot access this route. The source desk uses it to reopen imports. Provider names from the RSS catalog are reserved, like Gmail and Open-Meteo, to prevent imported data impersonating a direct provider.

Akiflow now documents an official remote OAuth MCP server; Beeper has a local MCP server. See [installation and connector design](installation-design.md) for verified endpoints and the distinction between assistant authorization and a scheduled newspaper connection. The current app provides guided export/import, not native MCP authorization.
