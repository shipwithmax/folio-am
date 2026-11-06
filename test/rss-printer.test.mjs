import test from "node:test";
import assert from "node:assert/strict";
import { parseRss, rssFeeds } from "../src/rss.mjs";
import { rssCatalog, editorialTemplates } from "../public/catalog.mjs";
import {
  defaults,
  validateConfig,
  edition,
  sampleFeeds,
} from "../public/core.mjs";
import { newModule } from "../public/modules.mjs";
import { printArgs } from "../bridge/print.mjs";
import { renderDocument } from "../public/render.mjs";
const now = new Date("2026-11-01T13:00:00Z"),
  provider = rssCatalog[0];
const item = (body) => `<rss><channel>${body}</channel></rss>`;
const valid = `<item><guid>one</guid><title><![CDATA[World & science]]></title><description><![CDATA[<b>A short update.</b><script>evil()</script>]]></description><link>https://example.com/story</link><pubDate>Sun, 01 Nov 2026 12:00:00 GMT</pubDate></item>`;
test("RSS preserves attribution and publication dates, strips HTML, skips unsafe links and duplicates", () => {
  const xml = item(
    valid +
      valid +
      "<item><title>Unsafe</title><link>javascript:alert(1)</link></item>",
  );
  const f = parseRss(xml, provider, now);
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].detail, "A short update.");
  assert.equal(f.items[0].source, "BBC World");
  assert.equal(f.items[0].publishedAt, "2026-11-01T12:00:00.000Z");
});
test("Atom alternate links work; stale and future-dated stories are excluded", () => {
  const f = parseRss(
    '<feed><entry><id>a</id><title>Atom item</title><link rel="alternate" href="https://example.com/a"/><summary>Summary</summary><updated>2026-11-01T12:00:00Z</updated></entry></feed>',
    provider,
    now,
  );
  assert.equal(f.items[0].title, "Atom item");
  assert.equal(
    parseRss(item(valid.replace("01 Nov 2026", "01 Oct 2026")), provider, now)
      .items.length,
    0,
  );
  assert.equal(
    parseRss(item(valid.replace("01 Nov 2026", "01 Dec 2026")), provider, now)
      .items.length,
    0,
  );
});
test("XML entities, malformed documents, and oversized payloads fail closed", () => {
  for (const xml of [
    '<!DOCTYPE rss [<!ENTITY x "bad">]><rss/>',
    "<rss>",
    "<html>not a feed</html>",
    "x".repeat(1024 * 1024 + 1),
  ])
    assert.throws(() => parseRss(xml, provider, now));
});
test("RSS only fetches enabled selected providers, caches successfully read feeds, and reports errors", async () => {
  let calls = 0;
  const cache = new Map();
  const fetcher = async (url, opts) => {
    calls++;
    assert.equal(url, provider.url);
    assert.equal(opts.redirect, "error");
    return new Response(item(valid));
  };
  const c = validateConfig({
    ...defaults,
    rssSources: ["bbc-world"],
    modules: [{ ...newModule("headlines"), sourceIds: ["BBC World"] }],
  });
  assert.equal(
    (await rssFeeds(c, now, fetcher, cache))["BBC World"].items.length,
    1,
  );
  await rssFeeds(c, now, fetcher, cache);
  assert.equal(calls, 1);
  assert.deepEqual(await rssFeeds({ ...c, rssSources: [] }, now, fetcher), {});
  assert.deepEqual(
    await rssFeeds(
      { ...c, modules: [{ ...c.modules[0], sourceIds: [] }] },
      now,
      fetcher,
    ),
    {},
  );
  assert.equal(
    (await rssFeeds(c, now, async () => new Response("bad", { status: 503 })))[
      "BBC World"
    ].error,
    true,
  );
  assert.equal(
    (
      await rssFeeds(
        c,
        now,
        async () => new Response("x".repeat(1024 * 1024 + 1)),
      )
    )["BBC World"].error,
    true,
  );
});
test("Brother profile enforces monochrome and propagates duplex without shell interpolation", () => {
  const c = validateConfig({
    ...defaults,
    printerProfile: "brother-hl-l2460dw",
    color: "color",
    duplex: "two-sided-long-edge",
  });
  assert.equal(c.color, "mono");
  const args = printArgs("Brother_HL_L2460DW", "/tmp/paper.pdf", {
    id: "test",
    paper: "Letter",
    color: "color",
    printerProfile: c.printerProfile,
    duplex: c.duplex,
  });
  assert.ok(args.includes("print-color-mode=monochrome"));
  assert.ok(args.includes("sides=two-sided-long-edge"));
  assert.throws(() =>
    printArgs("Brother", "/tmp/paper.pdf", {
      paper: "Letter",
      color: "mono",
      duplex: "x; evil",
    }),
  );
  assert.ok(
    printArgs("Brother", "/tmp/paper.pdf", {
      paper: "Letter",
      color: "mono",
    }).includes("sides=one-sided"),
  );
});
test("new typography and editorial presets are valid and rendered without external font requests", () => {
  for (const t of Object.values(editorialTemplates))
    assert.doesNotThrow(() =>
      validateConfig({
        ...defaults,
        voice: t.voice,
        readingLength: t.readingLength,
        density: t.density,
      }),
    );
  const config = {
    ...defaults,
    font: "charter",
    headingFont: "baskerville",
    mastheadScale: 120,
    lineHeight: 160,
    ruleStyle: "heavy",
    showSources: false,
    modules: [newModule("headlines")],
    rssSources: ["bbc-world"],
    topics: [],
  };
  const ed = edition(config, sampleFeeds(now, config), now, true),
    html = renderDocument(ed);
  assert.match(html, /--masthead-scale:1.2/);
  assert.match(html, /Baskerville/);
  assert.match(html, /BBC World/);
  assert.doesNotMatch(html, /@import/);
  for (const patch of [
    { headingFont: "url(bad)" },
    { mastheadScale: 500 },
    { lineHeight: 99 },
    { rssSources: ["http://localhost"] },
    { printerProfile: "unknown" },
  ])
    assert.throws(() => validateConfig({ ...defaults, ...patch }));
});
