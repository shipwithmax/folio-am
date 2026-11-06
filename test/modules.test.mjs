import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  validateConfig,
  normalizeFeed,
  edition,
  sampleFeeds,
} from "../public/core.mjs";
import { newModule, presetModules } from "../public/modules.mjs";
import { renderDocument } from "../public/render.mjs";
import { googleFeeds } from "../src/google.mjs";
import { weatherFeed } from "../src/weather.mjs";
const now = new Date("2026-10-31T12:00:00Z");
const feed = (items) => normalizeFeed({ items }, now);
test("legacy settings migrate to ordered modules and disabled modules stay out of sections", () => {
  const c = validateConfig({
    ...defaults,
    sections: ["email", "notes", "priorities"],
    maxItems: 4,
  });
  assert.deepEqual(
    c.modules.map((m) => m.type),
    ["email", "notes", "priorities"],
  );
  assert.equal(c.modules[0].limit, 4);
  c.modules[0].enabled = false;
  assert.deepEqual(validateConfig(c).sections, ["notes", "priorities"]);
});
test("duplicate section types retain independent sources and identity, including identical upstream IDs", () => {
  const a = { ...newModule("tasks", 1), sourceIds: ["Work"] };
  const b = { ...newModule("tasks", 2), sourceIds: ["Personal"] };
  const ed = edition(
    { ...defaults, modules: [b, a] },
    {
      Work: feed([{ id: "1", kind: "tasks", title: "Work task" }]),
      Personal: feed([{ id: "1", kind: "tasks", title: "Personal task" }]),
    },
    now,
  );
  assert.deepEqual(
    ed.modules.map((m) => m.items[0].title),
    ["Personal task", "Work task"],
  );
  const html = renderDocument(ed);
  assert.ok(
    html.indexOf('data-module="tasks-2"') <
      html.indexOf('data-module="tasks-1"'),
  );
  const all = edition(
    { ...defaults, modules: [newModule("tasks")] },
    {
      Work: feed([{ id: "1", kind: "tasks", title: "A" }]),
      Personal: feed([{ id: "1", kind: "tasks", title: "B" }]),
    },
    now,
  );
  assert.equal(all.modules[0].items.length, 2);
});
test("empty source selection excludes everything; priorities can draw from tasks without a tasks module", () => {
  const m = newModule("priorities");
  const feeds = {
    Work: feed([{ kind: "tasks", title: "Do this", priority: 1 }]),
  };
  assert.equal(
    edition({ ...defaults, modules: [m] }, feeds, now).modules[0].items.length,
    1,
  );
  assert.equal(
    edition({ ...defaults, modules: [{ ...m, sourceIds: [] }] }, feeds, now)
      .modules[0].items.length,
    0,
  );
});
test("focus prioritization, strict filtering, limits and global focus change the selected content", () => {
  const feeds = {
    Work: feed([
      { kind: "tasks", title: "Urgent email", priority: 1 },
      { kind: "tasks", title: "Research brief", priority: 3 },
      { kind: "tasks", title: "Another research note", priority: 2 },
    ]),
  };
  const m = { ...newModule("tasks"), focus: "research", limit: 1 };
  const ed = edition({ ...defaults, modules: [m] }, feeds, now);
  assert.equal(ed.modules[0].items[0].title, "Another research note");
  assert.equal(ed.modules[0].omitted, 2);
  assert.equal(
    edition(
      { ...defaults, modules: [{ ...m, focusMode: "only", limit: 12 }] },
      feeds,
      now,
    ).modules[0].items.length,
    2,
  );
  assert.equal(
    edition(
      { ...defaults, focus: "brief", modules: [{ ...m, focus: "" }] },
      feeds,
      now,
    ).modules[0].items[0].title,
    "Research brief",
  );
});
test("writing depth changes output while respecting email privacy and treatment inheritance", () => {
  const feeds = {
    Gmail: feed([
      {
        kind: "email",
        title: "Review proposal",
        detail: "First sentence. Second sentence.",
      },
    ]),
  };
  const m = newModule("email");
  assert.equal(
    edition(
      { ...defaults, emailSnippets: true, voice: "brief", modules: [m] },
      feeds,
      now,
    ).modules[0].items[0].detail.trim(),
    "First sentence.",
  );
  assert.equal(
    edition(
      {
        ...defaults,
        emailSnippets: false,
        modules: [{ ...m, length: "full" }],
      },
      feeds,
      now,
    ).modules[0].items[0].detail,
    "",
  );
  assert.equal(
    edition(
      {
        ...defaults,
        emailSnippets: true,
        modules: [{ ...m, length: "headlines" }],
      },
      feeds,
      now,
    ).modules[0].items[0].detail,
    "",
  );
  const html = renderDocument(
    edition({ ...defaults, voice: "action", modules: [m] }, feeds, now),
  );
  assert.match(html, /REVIEW INBOX/);
  assert.match(
    renderDocument(
      edition({ ...defaults, voice: "editorial", modules: [m] }, feeds, now),
    ),
    /1 item selected/,
  );
});
test("module settings reject unsafe values and escape printable free text", () => {
  const m = newModule("tasks");
  for (const patch of [
    { sourceIds: "Gmail" },
    { limit: 0 },
    { size: "bad" },
    { voice: "__proto__" },
    { id: "<script>" },
    { focusMode: "bad" },
  ])
    assert.throws(() =>
      validateConfig({ ...defaults, modules: [{ ...m, ...patch }] }),
    );
  assert.throws(() => validateConfig({ ...defaults, modules: [m, m] }));
  const html = renderDocument(
    edition(
      {
        ...defaults,
        modules: [{ ...m, title: "<script>bad</script>", focus: "<img>" }],
      },
      sampleFeeds(now),
      now,
      true,
    ),
  );
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;img&gt;/);
});
test("explicit source choices prevent unrelated Google and weather requests", async () => {
  const config = validateConfig({
    ...defaults,
    modules: [
      { ...newModule("email"), sourceIds: ["Imported inbox"] },
      { ...newModule("schedule"), sourceIds: ["Akiflow"] },
      { ...newModule("weather"), sourceIds: [] },
    ],
  });
  let calls = 0;
  const fetcher = () => {
    calls++;
    throw Error("must not fetch");
  };
  assert.deepEqual(
    await googleFeeds(
      {
        GOOGLE_CLIENT_ID: "fixture",
        GOOGLE_CLIENT_SECRET: "fixture",
        GOOGLE_REFRESH_TOKEN: "fixture",
      },
      config,
      now,
      fetcher,
    ),
    {},
  );
  assert.deepEqual(await weatherFeed({}, config, now, fetcher), {});
  assert.equal(calls, 0);
});
test("presets are editable valid configurations and old immutable editions still render", () => {
  for (const name of ["essential", "balanced", "weekend"])
    assert.doesNotThrow(() =>
      validateConfig({ ...defaults, modules: presetModules(name) }),
    );
  const ed = edition(defaults, sampleFeeds(now), now, true);
  delete ed.modules;
  ed.config = defaults;
  assert.match(renderDocument(ed), /The essential three/);
});

test("warnings follow source choices and identify missing selected imports", () => {
  const m = { ...newModule("tasks"), sourceIds: ["Selected"] };
  const ed = edition(
    { ...defaults, modules: [m] },
    { Unselected: { error: true, items: [] } },
    now,
  );
  assert.equal(ed.warnings.length, 1);
  assert.match(ed.warnings[0], /Selected: selected but not connected/);
  assert.equal(
    edition({ ...defaults, modules: [newModule("notes")] }, {}, now).warnings
      .length,
    0,
  );
});
