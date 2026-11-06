import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  validateConfig,
  normalizeFeed,
  edition,
} from "../public/core.mjs";
import { newModule } from "../public/modules.mjs";
import { saveConfigSnapshot } from "../public/editor-state.mjs";
import { runBridge } from "../bridge/print.mjs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const now = new Date("2026-11-01T14:00:00Z");

test("validated settings do not share mutable arrays with their input or defaults", () => {
  const before = structuredClone(defaults);
  const c = validateConfig(defaults);
  c.rssSources.push("nasa");
  c.topics.push("space");
  assert.deepEqual(defaults, before);
  const next = validateConfig(c);
  next.rssSources.length = 0;
  assert.deepEqual(c.rssSources, ["nasa"]);
});
test("invalid configuration containers and implicit local timezones are rejected", () => {
  for (const input of [
    null,
    [],
    "bad",
    { ...defaults, timezone: undefined },
    { ...defaults, timezone: "" },
  ])
    assert.throws(() => validateConfig(input));
});
test("source dates reject impossible days, reversed events, and timezone ambiguity", () => {
  for (const item of [
    { kind: "tasks", title: "Bad due", due: "2026-02-30" },
    { kind: "schedule", title: "No timezone", start: "2026-11-01T09:00:00" },
    {
      kind: "schedule",
      title: "Reversed",
      start: "2026-11-01T10:00:00Z",
      end: "2026-11-01T09:00:00Z",
    },
    {
      kind: "schedule",
      title: "Invalid day",
      start: "2026-02-30",
      allDay: true,
    },
  ])
    assert.throws(() => normalizeFeed({ items: [item] }, now));
  assert.doesNotThrow(() =>
    normalizeFeed(
      {
        items: [
          {
            kind: "schedule",
            title: "Leap day",
            start: "2028-02-29",
            end: "2028-03-01",
            allDay: true,
          },
        ],
      },
      now,
    ),
  );
});
test("imports reject malformed URLs and credentials embedded in links", () => {
  for (const url of [
    "https://",
    "https://name:password@example.com",
    "javascript:alert(1)",
  ])
    assert.throws(() =>
      normalizeFeed({ items: [{ kind: "tasks", title: "Link", url }] }, now),
    );
});
test("invalid and future snapshot timestamps never appear ready", () => {
  for (const updatedAt of ["bad", "2027-01-01T00:00:00Z"]) {
    const ed = edition(
      { ...defaults, modules: [newModule("tasks")] },
      {
        Test: {
          updatedAt,
          items: [{ id: "1", kind: "tasks", title: "Stale", priority: 1 }],
        },
      },
      now,
    );
    assert.equal(ed.modules[0].items.length, 0);
    assert.equal(ed.sourceStatus[0].status, "stale");
  }
});
test("equally relevant headlines put the newest publication first", () => {
  const feed = normalizeFeed(
    {
      items: [
        {
          id: "old",
          kind: "headlines",
          title: "Alphabetically first",
          publishedAt: "2026-10-31T12:00:00Z",
        },
        {
          id: "new",
          kind: "headlines",
          title: "Z latest",
          publishedAt: "2026-11-01T12:00:00Z",
        },
      ],
    },
    now,
  );
  const ed = edition(
    { ...defaults, modules: [newModule("headlines")] },
    { News: feed },
    now,
  );
  assert.equal(ed.modules[0].items[0].id, "new");
});
test("save acknowledges only the submitted snapshot when editing continues during a request", async () => {
  const c = validateConfig(defaults);
  let release, sent;
  const pending = saveConfigSnapshot(c, async (body) => {
    sent = body;
    await new Promise((r) => (release = r));
  });
  c.name = "A newer unsaved edit";
  release();
  const saved = await pending;
  assert.equal(saved, sent);
  assert.notEqual(JSON.stringify(c), saved);
  assert.equal(JSON.parse(saved).name, defaults.name);
});
test("failed save rejects without acknowledging a snapshot", async () => {
  await assert.rejects(
    saveConfigSnapshot(defaults, async () => {
      throw Error("offline");
    }),
    /offline/,
  );
});
test("printer dry-run does not send pending acknowledgements or mutate its journal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "press-audit-"));
  const text = JSON.stringify({
    "2026-11-01": { ackPending: true, claim: "pending", status: "submitted" },
  });
  try {
    await writeFile(join(dir, "journal.json"), text);
    let calls = 0;
    const result = await runBridge({
      base: "https://press.example",
      token: "fixture-".repeat(8),
      printer: "Brother",
      directory: dir,
      dryRun: true,
      fetcher: async () => {
        calls++;
        return Response.json({});
      },
    });
    assert.equal(result.status, "dry-run");
    assert.equal(calls, 0);
    assert.equal(await readFile(join(dir, "journal.json"), "utf8"), text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("public demo is isolated per visitor and refuses private ingestion or printer operations", async () => {
  const { createDemoApi } = await import("../public/demo.mjs");
  const a = createDemoApi(),
    b = createDemoApi();
  const initial = await a("/config");
  assert.equal(initial.publicDemo, true);
  await a("/config", {
    method: "PUT",
    body: JSON.stringify({ ...initial.config, name: "Visitor A" }),
  });
  assert.equal((await b("/config")).config.name, "The Daily Dispatch");
  assert.equal((await a("/config")).config.name, "Visitor A");
  for (const path of ["/feeds", "/preview", "/generate", "/print/claim"])
    await assert.rejects(
      a(path, { method: "POST", body: "{}" }),
      /fictional content only/,
    );
});
