# Installation and connectors: recommended product design

Verified against official documentation on November 1, 2026. Tracks [FS-503](https://linear.app/framework-systematics/issue/FS-503/build-self-hostable-daily-personal-newspaper-app).

## Customer installation without GitHub

Recommended customer experience: **Install my newspaper → sign in to Cloudflare → choose an account → approve permissions → connect sources → pair printer → test paper**.

Cloudflare supports third-party OAuth clients. Register a public installer client, verify its domain, and request only the account permissions required for the Worker, assets, Durable Object and schedule. The installer uploads a tested, versioned release through Cloudflare APIs; customers do not fork a repository or need GitHub accounts. Keep release builds separate from customer account credentials. Use authorization code + PKCE where appropriate, short-lived state, encrypted token storage, explicit account selection, revocation, and rollback. OAuth consent and deployment provisioning are separate implementation steps—not a finished feature in this kit.

[Cloudflare OAuth overview](https://developers.cloudflare.com/fundamentals/oauth/) · [Create an OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)

Cloudflare also documents temporary deployments and a claim flow. Supported resources include Workers static assets and Durable Objects. The user must complete the claim within 60 minutes or the temporary account/resources are deleted. Claiming does not give our installer continuing access: updates need separate OAuth authorization. This is a promising sample-only trial path; do not connect private mail or chats before ownership is established. Verify cron and any optional AI provisioning during a real acceptance test before choosing this as the main installer.

[Claim deployments](https://developers.cloudflare.com/workers/platform/claim-deployments/)

The conventional Deploy to Cloudflare button is a separate Git-based route. Keep it for technical users. The current source ZIP can already be used with Node/Wrangler without GitHub, but it is still a developer installation—not the intended consumer flow.

## MCP connections

Akiflow has an official remote MCP server at `https://mcp.akiflow.com/mcp`, with OAuth sign-in. Its help page lists paid plans and the free trial. A direct newspaper connection should authenticate the user, discover tools, and use an explicit reviewed allowlist of read operations and selected projects/calendars. Tool annotations or model instructions alone are not read-only enforcement. Store grants on the user's instance, refresh them for scheduled runs, and expose reconnect/disconnect and last successful synchronization. That direct client is not implemented yet; the current UI provides official setup instructions and a reviewed export/import path.

[Akiflow MCP documentation](https://product.akiflow.com/en/help/articles/4302815-akiflow-mcp)

Beeper's official MCP endpoint is `http://localhost:23373/v0/mcp`. It runs on the user's device and needs Beeper Desktop running. A Cloudflare Worker cannot use its own `localhost` to reach a customer's machine. Recommended design: one signed desktop companion handles both selected Beeper reads and printer delivery, with outbound authenticated connections to the user's Worker. Use separate scoped ingestion and print credentials; the current import API uses the broad owner credential and should not become a third-party background token. Do not publicly expose Beeper's local port. The existing Beeper exporter remains a local REST reader; a packaged MCP companion and automatic synchronization are not implemented.

[Beeper MCP documentation](https://developers.beeper.com/desktop-api/mcp/)

MCP is a connection protocol, not an AI model. Connecting a source to Codex or another assistant does not share that assistant's authorization with this application's unattended Worker.

## RSS and optional AI

The implemented RSS catalog includes BBC World, BBC Science, NASA News and Federal Reserve announcements. All four endpoints returned HTTP 200 and parsed successfully during verification. Feeds are off by default. Enabled feeds are fetched only when a selected headlines section uses them; the adapter caches successful results for ten minutes. It parses bounded RSS/Atom, rejects DTD/entity declarations, strips HTML, retains links/attribution/publication dates, and excludes dated articles older than seven days. There is no full-article scraping. Read publisher terms before distributing content commercially: public access is not a blanket redistribution license.

[BBC feed directory](https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm) · [NASA RSS](https://www.nasa.gov/rss-feeds/) · [Federal Reserve RSS](https://www.federalreserve.gov/feeds/feeds.htm)

Workers AI can be attached using a Worker binding, avoiding a separate AI vendor key. Proposed optional pipeline: retrieve authorized source items → rank → summarize into a validated structure → render with source references. Add an explicit per-source AI opt-in, usage budget, and source-text fallback. AI does not confer source access or automatically provide current news. AI rewriting is not implemented; the four new writing templates adjust the existing deterministic structure and depth.

[Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/)

## Brother HL-L2460DW

The user confirmed this model. Brother documents monochrome output, automatic duplex, Wi-Fi/Ethernet/USB, and AirPrint. The implemented printer profile enforces monochrome and supports single-sided, long-edge duplex, or short-edge duplex through CUPS. Your local profile can use Letter and long-edge duplex for a two-page paper on one sheet. Actual printer availability, duplex orientation, paper sizing, wake from sleep, and successful physical output still require hardware acceptance.

Cloudflare prepares and queues the edition. The local bridge renders a PDF and submits it to the installed printer queue. An always-awake host is needed for predictable 7 a.m. printing. No physical job was sent during development.

[Brother product specifications](https://www.brother-usa.com/p/laser-printers/HLL2460DW) · [Brother AirPrint guide](https://support.brother.com/g/s/id/htmldoc/printer/cv_hll2460dw/use/html/GUID-D8D10688-FA26-4D0F-9690-718F1E1590F7_1.html)

## Community project and commercial product

Use a public repository for contributors and downloadable, versioned releases for customers. Printer profiles, feed adapters, layouts, and connector mappings make useful contribution boundaries. Require fixtures and hardware evidence for claimed printer support. Choose an explicit software license before publishing and maintain separate publisher-content notices. No license choice, remote repository creation, publication, OAuth client registration, or production deployment was performed in this pass.

Recommended next milestone: registered Cloudflare installer + direct Akiflow OAuth/MCP client + signed printer/Beeper companion. Those are the remaining steps to the click-to-connect experience, not more documentation screens.
