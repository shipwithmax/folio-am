import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  validateConfig,
  normalizeFeed,
  localClock,
  edition,
  sampleFeed,
} from "../public/core.mjs";
import { renderDocument } from "../public/render.mjs";
const now = new Date("2026-10-31T12:00:00Z");
test("Chicago 7am follows DST and does not move to 6am in winter", () => {
  assert.deepEqual(localClock(now, "America/Chicago"), {
    date: "2026-10-31",
    time: "07:00",
  });
  assert.equal(
    localClock(new Date("2026-11-01T13:00:00Z"), "America/Chicago").time,
    "07:00",
  );
  assert.equal(
    localClock(new Date("2027-03-14T12:00:00Z"), "America/Chicago").time,
    "07:00",
  );
});
test("config rejects invalid schedules, unsafe stylesheet keys, and unknown fields", () => {
  for (const c of [
    { time: "25:00" },
    { timezone: "Mars/Olympus" },
    { style: "__proto__" },
    { sections: ["secret"] },
    { maxItems: 100 },
  ])
    assert.throws(() => validateConfig(c));
  assert.equal(validateConfig({ token: "x" }).token, undefined);
});
test("untrusted content is escaped and javascript URLs are rejected", () => {
  assert.throws(() =>
    normalizeFeed(
      {
        items: [{ kind: "email", title: "hello", url: "javascript:alert(1)" }],
      },
      now,
    ),
  );
  const html = renderDocument(
    edition(
      { ...defaults, name: "<script>alert(1)</script>" },
      {
        feed: normalizeFeed(
          {
            items: [
              {
                kind: "email",
                title: "<img src=x onerror=alert(1)>",
                source: "<svg>",
              },
            ],
          },
          now,
        ),
      },
      now,
    ),
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
});
test("stale and unavailable sources excluded; never silently replaced with samples", () => {
  const ed = edition(
    defaults,
    {
      Old: {
        updatedAt: "2026-10-01",
        items: [{ kind: "tasks", title: "stale" }],
      },
      Gmail: { error: true, items: [] },
    },
    now,
  );
  assert.equal(ed.groups.tasks.items.length, 0);
  assert.equal(ed.warnings.length, 2);
  assert.equal(ed.demo, false);
});
test("priority rules rank due work, omit completed items, and respect toggles", () => {
  const feed = normalizeFeed(
    {
      items: [
        {
          id: "a",
          kind: "tasks",
          title: "Tomorrow",
          due: "2026-11-01",
          priority: 1,
        },
        {
          id: "b",
          kind: "tasks",
          title: "Due today",
          due: "2026-10-31",
          priority: 3,
        },
        { id: "c", kind: "tasks", title: "Done", done: true, priority: 1 },
      ],
    },
    now,
  );
  const ed = edition(defaults, { tasks: feed }, now);
  assert.equal(ed.groups.priorities.items[0].title, "Due today");
  assert.equal(ed.groups.priorities.items.length, 1);
  assert.equal(ed.groups.tasks.items.length, 2);
  assert.equal(
    edition({ ...defaults, sections: ["email"] }, { tasks: feed }, now).groups
      .tasks,
    undefined,
  );
});
test("calendar filters events in the configured timezone, including all-day events", () => {
  const feed = normalizeFeed(
    {
      items: [
        {
          kind: "schedule",
          title: "Today",
          start: "2026-10-31T09:00:00-05:00",
        },
        {
          kind: "schedule",
          title: "Yesterday",
          start: "2026-10-30T09:00:00-05:00",
        },
        {
          kind: "schedule",
          title: "All day",
          start: "2026-10-31",
          end: "2026-11-01",
          allDay: true,
        },
      ],
    },
    now,
  );
  assert.equal(
    edition(defaults, { calendar: feed }, now).groups.schedule.items.length,
    2,
  );
  const html = renderDocument(edition(defaults, { calendar: feed }, now));
  assert.ok(html.includes("All day"));
});
test("sample labeling, item overflow, and email privacy survive rendering", () => {
  const ed = edition(
    { ...defaults, maxItems: 1 },
    { Sample: sampleFeed(now) },
    now,
    true,
  );
  const html = renderDocument(ed);
  assert.ok(html.includes("SAMPLE EDITION"));
  assert.ok(html.includes("additional items not shown"));
  assert.ok(!html.includes("Example message:"));
});
test("news topics filter headlines without affecting tasks", () => {
  const feed = normalizeFeed(
    {
      items: [
        { kind: "headlines", title: "Science story", topic: "science" },
        { kind: "headlines", title: "Sports story", topic: "sports" },
        { kind: "tasks", title: "Task" },
      ],
    },
    now,
  );
  const ed = edition(
    { ...defaults, sections: ["headlines", "tasks"], topics: ["science"] },
    { feed },
    now,
  );
  assert.equal(ed.groups.headlines.items.length, 1);
  assert.equal(ed.groups.tasks.items.length, 1);
});
