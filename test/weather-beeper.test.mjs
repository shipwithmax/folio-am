import test from "node:test";
import assert from "node:assert/strict";
import { defaults, validateConfig, edition } from "../public/core.mjs";
import { weatherFeed } from "../src/weather.mjs";
import { collectBeeper } from "../bridge/beeper-export.mjs";
import { renderDocument } from "../public/render.mjs";
const now = new Date("2026-10-31T12:00:00Z");
const config = {
  ...defaults,
  sections: ["weather", "messages"],
  weatherLatitude: "29.76",
  weatherLongitude: "-95.37",
};
const forecast = {
  daily: {
    time: ["2026-10-30", "2026-10-31"],
    weather_code: [0, 2],
    temperature_2m_max: [81, 76],
    temperature_2m_min: [66, 61],
    precipitation_probability_max: [10, 20],
  },
};
test("weather is opt-in and missing coordinates or commercial key do not call the provider", async () => {
  const noFetch = () => {
    throw Error("unexpected network call");
  };
  assert.deepEqual(await weatherFeed({}, defaults, now, noFetch), {});
  assert.equal(
    (await weatherFeed({}, { ...config, weatherLatitude: "" }, now, noFetch))[
      "Open-Meteo"
    ].error,
    true,
  );
  assert.equal(
    (
      await weatherFeed(
        {},
        { ...config, weatherPlan: "commercial" },
        now,
        noFetch,
      )
    )["Open-Meteo"].error,
    true,
  );
});
test("weather requests location and units, selects the local day, and prints attribution", async () => {
  let request;
  const feeds = await weatherFeed({}, config, now, async (url) => {
    request = url;
    return Response.json(forecast);
  });
  assert.equal(request.hostname, "api.open-meteo.com");
  assert.equal(request.searchParams.get("temperature_unit"), "fahrenheit");
  assert.equal(feeds["Open-Meteo"].items[0].title, "Partly cloudy · 76°F");
  const html = renderDocument(edition(config, feeds, now));
  assert.match(html, /Before you head out/);
  assert.match(html, /Open-Meteo · CC BY 4.0/);
  assert.match(html, /Rain chance 20%/);
});
test("commercial weather uses customer endpoint and never includes the credential in output", async () => {
  const key = "test-only-weather-fixture";
  const feeds = await weatherFeed(
    { WEATHER_API_KEY: key },
    { ...config, weatherPlan: "commercial" },
    now,
    async (url) => {
      assert.equal(url.hostname, "customer-api.open-meteo.com");
      assert.equal(url.searchParams.get("apikey"), key);
      return Response.json(forecast);
    },
  );
  assert.equal(JSON.stringify(feeds).includes(key), false);
});
test("weather missing values and HTTP failures are explicitly unavailable", async () => {
  for (const fetcher of [
    async () => new Response("{}", { status: 503 }),
    async () =>
      Response.json({
        daily: { ...forecast.daily, temperature_2m_max: [81, null] },
      }),
  ])
    assert.equal(
      (await weatherFeed({}, config, now, fetcher))["Open-Meteo"].error,
      true,
    );
});
test("weather coordinates and units validate", () => {
  for (const changes of [
    { weatherLatitude: "91" },
    { weatherLongitude: "-181" },
    { weatherLatitude: "  " },
    { weatherUnits: "kelvin" },
  ])
    assert.throws(() => validateConfig({ ...config, ...changes }));
});
const message = {
  id: "m1",
  chatID: "approved",
  timestamp: "2026-10-31T11:00:00Z",
  text: "Please review the notes",
  isSender: false,
};
test("Beeper enforces an explicit chat selection before accessing the local API", async () => {
  await assert.rejects(
    collectBeeper({
      token: "fixture",
      chatIDs: [],
      fetcher: () => {
        throw Error("network should not run");
      },
    }),
    /explicit/,
  );
});
test("Beeper reads only localhost, filters outgoing/deleted/unselected messages, and paginates", async () => {
  let calls = 0;
  const result = await collectBeeper({
    token: "fixture",
    chatIDs: ["approved"],
    now,
    fetcher: async (url, opts) => {
      calls++;
      assert.equal(url.origin, "http://127.0.0.1:23373");
      assert.equal(opts.method, "GET");
      assert.equal(opts.redirect, "error");
      assert.deepEqual(url.searchParams.getAll("chatIDs"), ["approved"]);
      assert.equal(url.searchParams.get("includeMuted"), "false");
      if (calls === 1)
        return Response.json({
          items: [
            message,
            { ...message, id: "bad", chatID: "private" },
            { ...message, id: "sent", isSender: true },
            { ...message, id: "deleted", isDeleted: true },
          ],
          hasMore: true,
          oldestCursor: "next",
          chats: { approved: { title: "Project" } },
        });
      assert.equal(url.searchParams.get("cursor"), "next");
      return Response.json({
        items: [message, { ...message, id: "m2", text: "Another message" }],
        hasMore: false,
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].kind, "messages");
  assert.equal(result.items[0].source, "Beeper · Project");
  assert.match(
    renderDocument(edition(config, { Beeper: result }, now)),
    /In conversation/,
  );
});
test("Beeper does not return a misleading partial feed after an error or stuck cursor", async () => {
  await assert.rejects(
    collectBeeper({
      token: "fixture",
      chatIDs: ["approved"],
      now,
      fetcher: async () => new Response("{}", { status: 401 }),
    }),
    /401/,
  );
  await assert.rejects(
    collectBeeper({
      token: "fixture",
      chatIDs: ["approved"],
      now,
      fetcher: async () =>
        Response.json({
          items: [message],
          hasMore: true,
          oldestCursor: "same",
        }),
    }),
    /did not advance/,
  );
});
