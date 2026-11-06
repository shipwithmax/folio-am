# Release audit — 1 November 2026

Project: [Folio AM](https://github.com/shipwithmax/folio-am).

## Fixed

- Configuration validation now rejects malformed roots, invalid timezones and impossible calendar dates. Returned configuration does not share nested defaults.
- Timed calendar events require offsets and a valid increasing time range. Unsafe or credential-bearing links are excluded. Invalid and future snapshot timestamps cannot silently pass freshness checks.
- Equal-relevance news sorts by recency. Aggregate feed imports have a 1.5 MB bound before storage mutation.
- Late-night schedules catch up across midnight. Retention runs even when delivery is paused.
- Printer dry runs perform no network or state mutations, including pending acknowledgements.
- Saving captures the submitted settings before awaiting the response; subsequent edits remain unsaved.
- Changing settings invalidates the printable proof immediately. Stale or failed previews cannot enable printing.
- Source editors wait for saved data before enabling imports, preventing accidental empty replacement. Failed reads show recovery instructions.
- Invalid form fields block panel changes and printing instead of silently losing edits.

## Verification

61 automated tests cover normal behavior and regressions, including demo isolation, authentication, request forgery, source validation, timezone scheduling, job claims, and bridge failures. Local Cloudflare runtime checks exercise authenticated settings, feeds, generation, claims, duplicate prevention, and acknowledgements. A two-page sample PDF has readable text on both pages. Browser checks cover the edit-during-save race, failed previews, source loading, invalid fields, and a 320-pixel layout.

The design uses MaxShip's paper, sky, ink and orange palette, strong display type, and metal-like trim. Reference PRs: [boxed kit family #121](https://github.com/shipwithmax/maxship-site/pull/121) and [demo/download precedent #116](https://github.com/shipwithmax/maxship-site/pull/116). No personal dossier content is included.

## Remaining acceptance work

- Real Brother HL-L2460DW printing, duplex alignment, wake/restart behavior, and recovery still need physical verification.
- Direct Google access needs owner-provisioned OAuth credentials and live refresh testing.
- Akiflow/Beeper MCP setup is documented; direct scheduled MCP authorization and synchronization are not implemented.
- A consumer GitHub-free installer, signed desktop companion, billing, and shared multi-user hosting are not built.
- The hosted demo is a public sandbox with fictional data, not a deployed private newspaper service.
- Automated tests are not proof that every defect has been found.
