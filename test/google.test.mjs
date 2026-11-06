import test from "node:test";
import assert from "node:assert/strict";
import { googleFeeds } from "../src/google.mjs";
import { defaults, edition } from "../public/core.mjs";
const env = {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REFRESH_TOKEN: "test-refresh",
  },
  now = new Date("2026-10-31T12:00:00Z");
test("missing credentials stay disconnected and invalid credentials report unavailability", async () => {
  assert.deepEqual(await googleFeeds({}, defaults, now), {});
  const result = await googleFeeds(
    env,
    defaults,
    now,
    async () => new Response("{}", { status: 401 }),
  );
  assert.equal(result.Gmail.error, true);
  assert.equal(result["Google Calendar"].error, true);
});
test("Google requests are read-only, calendar pagination handled, Gmail flags ranked", async () => {
  const urls = [];
  const fetcher = async (url, opts) => {
    urls.push(String(url));
    if (String(url).includes("/token"))
      return Response.json({ access_token: "test-access" });
    assert.equal(opts.headers.Authorization, "Bearer test-access");
    assert.ok(!opts.method || opts.method === "GET");
    if (String(url).includes("messages?"))
      return Response.json({ messages: [{ id: "m1" }] });
    if (String(url).includes("/messages/m1"))
      return Response.json({
        id: "m1",
        snippet: "Private message body",
        labelIds: ["STARRED"],
        payload: {
          headers: [
            { name: "Subject", value: "Please review" },
            { name: "From", value: "Colleague" },
          ],
        },
      });
    if (String(url).includes("pageToken=next"))
      return Response.json({
        items: [
          {
            id: "2",
            summary: "Meeting",
            start: { dateTime: "2026-10-31T09:00:00-05:00" },
            end: { dateTime: "2026-10-31T10:00:00-05:00" },
          },
        ],
      });
    return Response.json({
      nextPageToken: "next",
      items: [
        {
          id: "1",
          summary: "All day",
          start: { date: "2026-10-31" },
          end: { date: "2026-11-01" },
        },
      ],
    });
  };
  const feeds = await googleFeeds(env, defaults, now, fetcher);
  assert.equal(feeds.Gmail.items[0].priority, 1);
  assert.equal(feeds.Gmail.items[0].detail, "");
  assert.equal(feeds["Google Calendar"].items.length, 2);
  assert.ok(urls.some((u) => u.includes("pageToken=next")));
  assert.equal(edition(defaults, feeds, now).groups.schedule.items.length, 2);
});
test("disabled email and schedule sections do not query Google", async () => {
  const result = await googleFeeds(
    env,
    { ...defaults, sections: ["tasks"] },
    now,
    async () => {
      throw Error("Must not fetch");
    },
  );
  assert.deepEqual(result, {});
});
