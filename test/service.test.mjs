import test from "node:test";
import assert from "node:assert/strict";
import { PressService, authorize } from "../src/service.mjs";
import { defaults, localClock } from "../public/core.mjs";
const env = {
  ADMIN_TOKEN: "owner-fixture-".repeat(4),
  PRINT_TOKEN: "printer-fixture-".repeat(4),
};
function fixture() {
  const data = new Map();
  const storage = {
    get: async (k) => structuredClone(data.get(k)),
    put: async (k, v) => {
      if (typeof k === "object")
        for (const [a, b] of Object.entries(k)) data.set(a, structuredClone(b));
      else data.set(k, structuredClone(v));
    },
    list: async ({ prefix }) =>
      new Map(
        [...data]
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => [k, structuredClone(v)]),
      ),
    delete: async (k) => data.delete(k),
  };
  return { service: new PressService(storage, env), data, storage };
}
const req = (path, method = "GET", body, token = env.ADMIN_TOKEN, extra = {}) =>
  new Request("https://press.example/api" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...extra,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
test("private routes reject anonymous clients and printer cannot access email/config", async () => {
  const { service } = fixture();
  assert.equal(
    (await service.handle(req("/config", "GET", undefined, ""))).status,
    401,
  );
  assert.equal(
    (await service.handle(req("/config", "GET", undefined, env.PRINT_TOKEN)))
      .status,
    401,
  );
  assert.equal(
    (await service.handle(req("/print/claim", "POST", {}, env.ADMIN_TOKEN)))
      .status,
    401,
  );
});
test("same-origin mutations enforced, settings validated", async () => {
  const { service } = fixture();
  assert.equal(
    (
      await service.handle(
        req("/config", "PUT", defaults, env.ADMIN_TOKEN, {
          Origin: "https://evil.example",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await service.handle(
        req("/config", "PUT", { ...defaults, time: "29:50" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await service.handle(req("/config", "PUT", defaults))).status,
    200,
  );
});
test("login issues bounded HttpOnly cookie; expired sessions denied", async () => {
  const { service } = fixture();
  const r = await service.handle(
    req("/login", "POST", { token: env.ADMIN_TOKEN }, ""),
  );
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("set-cookie"),
    /Secure; HttpOnly; SameSite=Strict/,
  );
  const cookie = r.headers.get("set-cookie").split(";")[0];
  assert.equal(
    await authorize(
      new Request("https://press.example", { headers: { Cookie: cookie } }),
      env,
    ),
    true,
  );
  assert.equal(
    await authorize(
      new Request("https://press.example", {
        headers: { Cookie: "press_session=1.invalid" },
      }),
      env,
    ),
    false,
  );
});
test("concurrent scheduled runs generate one immutable edition and one job", async () => {
  const { service, data, storage } = fixture();
  await storage.put("config", { ...defaults, enabled: true });
  const now = new Date("2026-10-31T12:05:00Z");
  await Promise.all(
    Array.from({ length: 8 }, () => service.serial(() => service.tick(now))),
  );
  assert.equal(
    [...data.keys()].filter((k) => k.startsWith("edition:")).length,
    1,
  );
  assert.equal([...data.keys()].filter((k) => k.startsWith("job:")).length, 1);
  assert.equal(
    (await service.tick(new Date("2026-10-31T11:55:00Z"))).status,
    "outside-window",
  );
});
test("claim is atomic, acknowledgements are idempotent, and no automatic reclaim", async () => {
  const { service } = fixture();
  await service.serial(() => service.generate());
  const claims = await Promise.all([
    service.handle(req("/print/claim", "POST", {}, env.PRINT_TOKEN)),
    service.handle(req("/print/claim", "POST", {}, env.PRINT_TOKEN)),
  ]);
  const bodies = await Promise.all(claims.map((r) => r.json()));
  assert.equal(bodies.filter((b) => b.job).length, 1);
  const job = bodies.find((b) => b.job).job;
  assert.equal(
    (
      await service.handle(
        req(
          "/print/ack",
          "POST",
          { id: job.id, claim: "bad", status: "submitted" },
          env.PRINT_TOKEN,
        ),
      )
    ).status,
    409,
  );
  const ack = {
    id: job.id,
    claim: job.claim,
    status: "submitted",
    receipt: "queue-1",
  };
  await service.handle(req("/print/ack", "POST", ack, env.PRINT_TOKEN));
  const second = await service.handle(
    req("/print/ack", "POST", { ...ack, status: "failed" }, env.PRINT_TOKEN),
  );
  assert.equal((await second.json()).job.status, "submitted");
  assert.equal(
    (
      await (
        await service.handle(req("/print/claim", "POST", {}, env.PRINT_TOKEN))
      ).json()
    ).job,
    null,
  );
});
test("feed import and preview round trip, live never inserts fictional items", async () => {
  const { service } = fixture();
  const result = await service.handle(
    req("/feeds", "POST", {
      name: "My tasks",
      items: [{ kind: "tasks", title: "Real task", priority: 1 }],
    }),
  );
  assert.equal(result.status, 200);
  const ed = await (
    await service.handle(req("/preview", "POST", { demo: false }))
  ).json();
  assert.equal(ed.groups.priorities.items[0].title, "Real task");
  assert.equal(ed.demo, false);
});
test("local demo cannot generate physical print jobs", async () => {
  const { storage } = fixture();
  const service = new PressService(storage, { LOCAL_DEMO: true });
  assert.equal(
    (await service.handle(req("/generate", "POST", {}))).status,
    409,
  );
});

test("feed names are explicit strings and prototype keys are rejected", async () => {
  const { service } = fixture();
  for (const name of [undefined, "__proto__", "constructor"])
    assert.equal(
      (await service.handle(req("/feeds", "POST", { name, items: [] }))).status,
      400,
    );
});

test("owners can reopen imported sources for editing; printer credentials cannot read source data", async () => {
  const { service } = fixture();
  await service.handle(
    req("/feeds", "POST", {
      name: "My tasks",
      items: [
        {
          id: "kept",
          kind: "tasks",
          title: "Original task",
          detail: "Preserve context",
        },
      ],
    }),
  );
  const response = await service.handle(req("/feeds?name=My%20tasks"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items[0].id, "kept");
  assert.equal(data.items[0].detail, "Preserve context");
  assert.equal(
    (
      await service.handle(
        req("/feeds?name=My%20tasks", "GET", undefined, env.PRINT_TOKEN),
      )
    ).status,
    401,
  );
  assert.equal((await service.handle(req("/feeds?name=missing"))).status, 404);
});
test("public RSS provider names cannot be overwritten by imported content", async () => {
  const { service } = fixture();
  assert.equal(
    (
      await service.handle(
        req("/feeds", "POST", { name: "BBC World", items: [] }),
      )
    ).status,
    400,
  );
});

test("aggregate import size is bounded before replacing stored source data", async () => {
  const { service, storage } = fixture();
  const items = Array.from({ length: 150 }, (_, i) => ({
    id: String(i),
    kind: "tasks",
    title: "x".repeat(180),
    detail: "x".repeat(400),
    source: "x".repeat(60),
    url: "https://example.com/" + "x".repeat(390),
  }));
  let accepted = 0;
  for (let i = 0; i < 10; i++) {
    const result = await service.handle(
      req("/feeds", "POST", { name: `Bulk ${i}`, items }),
    );
    if (result.status === 400) {
      assert.match((await result.json()).error, /too large/);
      assert.equal(Object.keys(await storage.get("feeds")).length, accepted);
      assert.equal(
        Object.hasOwn(await storage.get("feeds"), `Bulk ${i}`),
        false,
      );
      return;
    }
    assert.equal(result.status, 200);
    accepted++;
  }
  assert.fail("All feeds fit unexpectedly: size guard was not exercised");
});

test("late-night schedules prepare at the next tick across midnight, once per print date", async () => {
  const { service, storage, data } = fixture();
  await storage.put("config", {
    ...defaults,
    time: "23:59",
    timezone: "UTC",
    enabled: true,
  });
  assert.equal(
    (await service.tick(new Date("2026-11-01T23:55:00Z"))).status,
    "outside-window",
  );
  assert.equal(
    (await service.tick(new Date("2026-11-02T00:00:00Z"))).status,
    "ready",
  );
  await service.tick(new Date("2026-11-02T00:05:00Z"));
  assert.equal([...data.keys()].filter((k) => k.startsWith("job:")).length, 1);
  assert.ok(data.has("job:2026-11-02"));
});
test("retention runs while delivery is paused", async () => {
  const { service, storage, data } = fixture();
  await storage.put({
    config: { ...defaults, enabled: false },
    "edition:2026-10-01": {},
    "job:2026-10-01": {},
    "edition:2026-11-01": {},
  });
  assert.equal(
    (await service.tick(new Date("2026-11-01T12:00:00Z"))).status,
    "paused",
  );
  assert.equal(data.has("edition:2026-10-01"), false);
  assert.equal(data.has("job:2026-10-01"), false);
  assert.equal(data.has("edition:2026-11-01"), true);
});
