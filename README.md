# Folio AM

**Your own front page.** Created and launched by **Max Palmer**, built at **Framework Systematics**, and published through [shipwithmax](https://github.com/shipwithmax/folio-am). Licensed under [MIT](LICENSE).

A self-hostable personal morning newspaper. Compose up to 24 movable modules, each with its own sources, writing treatment, focus, depth, and size. Customize the masthead, fonts, columns, ink, paper size, and delivery time. Generate a private daily edition in Cloudflare; print through a small Mac/Linux bridge on your own network.

**Status: v0.1.0 developer preview. The public website is a concept landing page; the private service and physical printer have not been deployed or connected.** UI, source adapters, scheduler, authenticated job queue, and printer bridge are implemented. The direct Google adapter still needs your OAuth credentials. Native Superhuman/direct Akiflow MCP connections, a consumer OAuth onboarding flow, billing, and a hosted multi-user service are not implemented. The common feed endpoint supports integrations written against their authorized APIs.

Next acceptance step: private Cloudflare deployment, read-only Google authorization, and one physical printer test. No private inbox content is included in this repository.

## Try it locally

Node 22 or newer:

```sh
npm ci
node scripts/dev.mjs
```

Open <http://127.0.0.1:4173> for the landing page, or <http://127.0.0.1:4173/studio.html> for your local editor. The local preview is loopback-only, has no account credentials, and cannot queue physical print jobs. Settings and imported test data persist in ignored `work/local-state.json`. Sample content is visibly labeled; switching it off uses only connected/imported data. No bundling step is required for the preview. `npm run build` validates a deployment bundle using Wrangler dry-run; it does not deploy.

```sh
node --test test/*.test.mjs
node scripts/runtime-check.mjs
npx playwright install chromium --only-shell
node scripts/sample.mjs
```

The sample command writes `sample-edition.html` and `sample-edition.pdf` alongside this repository, never to a printer. A growing edition can span multiple pages: no content is hidden to force one page. Per-section limits show an omitted-item count.

## Edition studio

- **Sections:** add from ten module types, drag or use arrows to reorder, hide, remove, or duplicate. A duplicated inbox or task section can use different sources and focus words. The printed order matches the outline. Up to 24 modules, each limited to 1–12 items.
- **Sources:** select actual source identities within each section; “all compatible” includes future imports, while selecting none includes no items. Excluding Google or Open-Meteo from every relevant module also suppresses its provider request. The catalog distinguishes configured credentials, imported snapshots, and setup still needed. Manual tasks accept one task per line; JSON file loading lets you review before import.
- **Editorial direction:** set global defaults, then override per module. Source voice preserves the text; Concise uses the first sentence (up to 150 characters); Editorial adds a digest introduction; Action-oriented adds review/to-do labels. Headlines-only, short summaries, and full context control detail. These are deterministic treatments, not LLM rewrites. Email excerpt privacy still applies.
- **Focus:** comma-separated keyword/phrase matches in title, detail, source, or topic. Matching items rank first, or strict mode includes only matches. Calendar keeps chronological order; strict focus still filters it. Topics additionally constrain tagged news.
- **Style:** masthead, owner, city, tagline, three newspaper traditions, eight local font stacks, separate headline fonts, masthead size, line spacing, divider rules, four palettes, black-and-white, Letter/A4, text size, column count, spacing, and source credits. Weather/market credits always print. Modules can be compact, standard, or full-width features, with story, list, or checklist presentation.
- **Workflow:** Essential/Balanced/Weekend presets, undo/redo (current tab session), live preview, an expanded proof, reading-time estimate, save, and print/PDF. Template export/import contains settings only, never feed items or credentials. Reloading restores the saved edition. Preview is a continuous layout; the browser’s print preview shows final pagination. Larger editions flow onto additional pages.

Old section-based settings migrate when read. Modules become the authoritative composition; legacy `sections` and first-per-type `groups` remain for compatibility. The same composition and renderer power the browser preview and printer bridge. Source contracts live in `docs/connectors.md`, module definitions and validation in `public/modules.mjs`, content selection in `public/core.mjs`, and newspaper rendering in `public/render.mjs`.

## Source desk and installation design

Sources now separates MCP apps, public RSS feeds, and imports. Official Akiflow and Beeper guides expose their correct MCP addresses, authorization steps, and a read-only export prompt; this does not imply a direct scheduled MCP connection is implemented. Existing imports can be reopened and edited, and each source exposes the sections where it appears. News presets for BBC World, BBC Science, NASA and the Federal Reserve can be selected without an account or AI key. RSS starts disabled and retains source attribution even if other credits are hidden.

Style adds eight local font stacks, separate headline typography, masthead scale, line spacing, divider rules, and Executive Brief / Reader's Edition / News Wire / Sunday Digest templates. Templates apply across sections and can be undone. These templates do not use an LLM.

See [the verified installation and connector design](docs/installation-design.md) for GitHub-free Cloudflare OAuth installation, claimable trials, official MCP availability, optional Workers AI, the confirmed Brother printer, and a community contribution model. The production installer and signed desktop companion are proposed, not built.

## Architecture

```text
Google Gmail / Calendar ──────┐
Authorized custom feed ───────┼─> Cloudflare Worker + one Durable Object
Your settings ───────────────┘         │
                        timezone-aware cron (every 5 minutes)
                                      │
                               immutable daily edition
                                      │ authenticated outbound poll
                              Mac / Linux print bridge
                                      │ local Chromium → PDF → CUPS
                               USB / LAN / AirPrint printer
```

Each deployment has one owner and one printer token. Customers deploy their own instance, keeping accounts and state separate. This is not a shared multi-tenant backend. No public printer port or inbound home-network connection is needed. The cloud stores normalized feed items and editions; PDF generation happens locally, avoiding an additional cloud rendering dependency.

## What works

- Three original newspaper styles: Metropolitan, Financial Journal, West Coast; familiar serif font stacks, editable name/byline/city, black-and-white or four accent palettes; 1–3 columns, three spacing densities, and 85–130% reading text size.
- Priorities, calendar, email, tasks, headlines, markets, facts, and notes. Topic filters apply to tagged headlines. Blank topics means all. Untagged items are included.
- Explicit priority and due-date sorting. Inbox flags rank email candidates; this version does not use an LLM to infer obligations or summarize mail. Gmail reads up to 30 recent inbox candidates and presents a bounded selection, not a claim to have reviewed the entire mailbox.
- Read-only Gmail and primary Google Calendar adapters, refresh-token support, recurring-event expansion, pagination, local-day filtering and all-day events.
- A provider-neutral JSON input for custom tools, news, and market providers. No invented prices or headlines. Direct integrations require separate approved API access.
- Local-time scheduling including DST. Delivery defaults to paused, 07:00 America/Chicago. Runs within five minutes; a one-hour catch-up window handles delays. This is preparation time, not a guarantee of physical print completion at exactly 07:00.
- Authenticated settings and feeds, HttpOnly signed 8-hour sessions, separate printer credential, escaped content, source freshness warnings, bounded requests, and private no-store API responses.
- Serialized generation and claims, one edition/job per local date, 14-day edition/job retention checked by the scheduler, including while delivery is paused. The current imported feeds remain until replaced or deleted. Stale imported data older than 36 hours is excluded; refresh external feeds daily.
- A bridge with a local journal and lock, shell-free `lp` invocation, idempotent acknowledgement, explicit reprint, and uncertainty handling. `submitted` means CUPS accepted the job, not that paper physically emerged.

## Deploy into your own Cloudflare

These commands create live infrastructure and secrets. They were **not run** in this implementation session. Review and authorize deployment and credential provisioning first.

1. Use a separate Cloudflare account or Worker per customer. Review `wrangler.jsonc`; change the Worker name if needed. The SQLite-backed Durable Object migration is included. No D1/R2 resource provisioning is required.
2. Authenticate with `npx wrangler login`.
3. Choose two different randomly generated access keys of at least 32 characters. Store them in your password manager. Enter them through Wrangler's interactive prompts; never put real keys in code, command arguments, screenshots, or this repository:

   ```sh
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler secret put PRINT_TOKEN
   ```

4. Optional direct Google connection: create your own Google OAuth client, enable Gmail and Calendar APIs, authorize the read-only scopes, and obtain an offline refresh token using Google's documented OAuth flow. A helper production consent UI is not included. Store the three values through interactive prompts:

   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GOOGLE_REFRESH_TOKEN
   ```

   Scopes: `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/calendar.events.readonly`. Tokens must cover both APIs if both sections are enabled. Google's consent/verification requirements depend on how you distribute the app; review them before offering a common OAuth client to customers. A token in testing mode may expire; test refresh longevity before relying on unattended delivery.

5. Deploy with `npx wrangler deploy`. Sign in with the owner key. Confirm source availability in the live preview, then configure the bridge below. Enable daily delivery only after a successful test.

Read [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [Calendar event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), and [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Printer setup

Max confirmed the Brother HL-L2460DW. Select its profile under Delivery; it enforces monochrome output and supports single-sided, long-edge duplex, and short-edge duplex. Physical printing has not yet been verified. First add it in macOS Printers & Scanners or your Linux CUPS settings and verify it can print a PDF. This bridge uses the installed queue, so no vendor-specific private API is assumed. Color requires color-capable hardware; a monochrome model remains monochrome. The default is single-sided Letter; A4 is selectable. The generic default remains single-sided; the selected duplex setting is stored in each immutable print job.

```sh
lpstat -p -d
npx playwright install chromium --only-shell
```

Configure the bridge process with `PRESS_URL` (the HTTPS deployment origin), `PRINT_TOKEN` (the separate printer key), `PRINTER_NAME` (the exact CUPS queue name), and `PRESS_STATE_DIR` (an absolute private writable directory). Use your operating system's credential or service-management mechanism; do not paste credentials into chat. The bridge reads only those values and does not enumerate other secrets.

```sh
node bridge/print.mjs --dry-run
node bridge/print.mjs
```

`--dry-run` validates local options (not live printer connectivity) and performs no network requests, journal writes, acknowledgements, claims, or printing. The normal invocation prints at most one pending current-day edition. Run it every minute using launchd (Mac), a systemd timer (Linux), or cron with a private wrapper. A machine that is off/asleep cannot print; a continuously available Mac mini or Raspberry Pi is suitable. No system job was installed by this session.

Example timer cadence (configure credentials separately):

```cron
* * * * * /absolute/path/to/private-bridge-wrapper
```

The wrapper should change to the repository and invoke the absolute Node path plus `bridge/print.mjs`. Do not log tokens. A fully unattended Mac installation needs a correctly provisioned LaunchAgent, awake host, and tested wake/restart behavior; those machine-specific settings remain an acceptance step.

If the journal says `submitted`, the job reached CUPS. Check `lpstat -o` and the physical printer for actual completion. If the bridge crashes, inspect any `bridge.lock` and printer queue before removing the stale lock. A claimed job is never automatically reclaimed. An uncertain submission requires an explicit owner reprint in Delivery. The queue does not replay yesterday's paper after an outage. Reprints apply only to today's immutable edition.

## Weather and Beeper

Weather is an optional section. In Sources → Open-Meteo → Set up, enter city-center latitude/longitude, and choose Fahrenheit or Celsius. Sample mode uses explicitly fictional weather. In live mode, enabling the section sends the selected coordinates and timezone to Open-Meteo. Missing settings, provider errors, or missing forecast values produce an unavailable-source warning instead of fabricated weather.

The personal/non-commercial setting uses Open-Meteo's free endpoint. Commercial use requires an appropriate subscription: select Commercial subscription and provision `WEATHER_API_KEY` through an approved Wrangler secret prompt. The key is used only with the fixed customer endpoint and is never included in edition content. Attribution is printed. See [Open-Meteo pricing](https://open-meteo.com/en/pricing) and [forecast API](https://open-meteo.com/en/docs).

Beeper is a separate Messages section. Its Desktop API runs locally and requires Beeper Desktop to be running. The included exporter reads the last 24 hours of incoming messages from an explicit chat allowlist, excludes muted/low-priority chats in the API query and deleted/hidden/outgoing messages in normalization, and writes the common feed format locally. It has no message-send or cloud-upload operation. Messages remain messages, not inferred tasks.

After separately authorizing/enabling Beeper's Desktop API and configuring `BEEPER_ACCESS_TOKEN` and comma-separated `BEEPER_CHAT_IDS` in the local process:

```sh
node bridge/beeper-export.mjs --out work/beeper-feed.json
```

The file is created exclusively with private permissions; choose a new name for another export. Review it before importing its JSON under Sources → Beeper → Set up. Importing to a deployed instance uploads that selected content to your Cloudflare account. Automatic Beeper-to-cloud synchronization is not installed or implemented. No live Beeper account was accessed during development. Beeper recommends the Desktop API for personal use; review its current terms before bundling it commercially. See [Beeper Desktop API](https://developers.beeper.com/desktop-api/) and [message search](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/search/).

## Other tools and custom data

See [the connector contract](docs/connectors.md). Superhuman Gmail-backed mail can use the Gmail adapter; Superhuman-specific splits/reminders are not fetched. Akiflow tasks need an authorized feed producer or a verified available API/MCP connection; do not assume that a calendar contains every Akiflow task. The transcription “Veper” was clarified as weather / Beeper; both now have optional paths described above. No credentials from Codex connectors are copied into the app.

## Tests and operational limits

`node --test test/*.test.mjs` covers source normalization, escaping, privacy, topic selection, DST, event filtering, auth, CSRF, serial job generation, duplicate claims, acknowledgement retries, and uncertain printer submissions. The Google adapter is tested against fixture HTTP responses, not live Google credentials. Cloudflare's local runtime can be checked using `npx wrangler dev --local`; this does not deploy.

Before a sale: finish verified native integrations and OAuth onboarding, physical printer acceptance, customer setup/recovery flows, privacy/retention controls, licensing and support terms, account revocation, operational monitoring, and any billing/entitlement system. No payment system or revenue functionality is represented as built.

## Research references

[Firstlight](https://github.com/cruftbox/firstlight), [Goosepaper](https://goosepaper.jordan.matelsky.com/), and [vael-paper](https://github.com/vaelkeep/vael-paper) demonstrate related personal-newspaper approaches. This implementation is original; their source code, assets, and licenses were not imported. Styles reference broad newspaper typography rather than reproduce publisher branding. Printer behavior follows [OpenPrinting CUPS documentation](https://openprinting.github.io/cups/doc/options.html).

## Public launch page and release packaging

Folio AM is being launched by Max Palmer, with Framework Systematics credited for the build. The positioning is your own news: personal conversations, decisions, plans, people and milestones, with outside interests optional. The planned offer combines an open-source self-hosted edition with paid managed setup and supported integrations. The source is MIT-licensed, copyright 2026 Max Palmer, and published at [shipwithmax/folio-am](https://github.com/shipwithmax/folio-am). See [attribution](NOTICE.md) and [contribution guide](CONTRIBUTING.md).

`node scripts/build-demo.mjs` builds only the public concept landing into `work/public-demo/` from an explicit six-file allowlist. It removes the prior generated assets first, excluding the studio, API adapters and source ZIP. The local development studio remains at `/studio.html` for private development. Do not copy the entire `public/` folder to the concept deployment.

The signup CTA continues to MaxShip's existing newsletter at `https://max-ship.com/log/#subscribe`, as requested. It does not create a dedicated product reservation or process payment. No signup was submitted during testing.

The landing includes original generated printer and travel imagery, classic-ink/color previews, three personal newspaper editions, an illustrative relevance/timeliness matrix, and three prewritten humor variants. Getty Images is shown as a planned licensed integration; no Getty assets or API are included. The connector gallery is an explicit roadmap. Instant consumer setup, managed service, live AI summaries/memes and the full set of native integrations are not represented as shipped.

Brand/domain availability has not been legally cleared. The managed subscription remains a planned offering; this release makes the self-hostable developer preview available.
