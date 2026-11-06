import { build } from "esbuild";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { newModule } from "../public/modules.mjs";
import { defaults } from "../public/core.mjs";
const admin = "local-runtime-owner-fixture-".repeat(2),
  printer = "local-runtime-printer-fixture-".repeat(2);
await build({
  entryPoints: ["src/worker.mjs"],
  bundle: true,
  format: "esm",
  platform: "browser",
  external: ["cloudflare:workers"],
  outfile: "work/runtime-worker.mjs",
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    telemetry: { enabled: false },
    workers: [
      {
        name: "morning-edition",
        modules: [{ type: "ESModule", path: "work/runtime-worker.mjs" }],
        modulesRoot: process.cwd(),
        compatibilityDate: "2026-10-01",
        durableObjects: { PRESS: { className: "Press", useSQLite: true } },
        bindings: { ADMIN_TOKEN: admin, PRINT_TOKEN: printer },
      },
    ],
  }),
);
const call = (path, method = "GET", body, token = admin) =>
  mf.dispatchFetch("https://example.com/api" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
try {
  const unauth = await call("/config", "GET", undefined, "");
  if (unauth.status !== 401) console.log(await unauth.text());
  assert.equal(unauth.status, 401);
  assert.equal(
    (
      await call("/config", "PUT", {
        ...defaults,
        printerProfile: "brother-hl-l2460dw",
        color: "color",
        duplex: "two-sided-long-edge",

        modules: [
          {
            ...newModule("priorities"),
            sourceIds: ["Test"],
            title: "Runtime priorities",
          },
          { ...newModule("tasks"), sourceIds: [] },
        ],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/feeds", "POST", {
        name: "Test",
        items: [{ kind: "tasks", title: "Runtime test task", priority: 1 }],
      })
    ).status,
    200,
  );
  const generation = await call("/generate", "POST", {});
  assert.equal(generation.status, 200);
  const ed = await generation.json();
  assert.equal(ed.groups.priorities.items[0].title, "Runtime test task");
  const claim = await (await call("/print/claim", "POST", {}, printer)).json();
  assert.ok(claim.html.includes("Runtime test task"));
  assert.ok(claim.html.includes("Runtime priorities"));
  assert.equal(ed.modules[1].items.length, 0);
  assert.equal(claim.job.status, "claimed");
  assert.equal(claim.job.color, "mono");
  assert.equal(claim.job.duplex, "two-sided-long-edge");
  assert.equal(
    (await (await call("/print/claim", "POST", {}, printer)).json()).job,
    null,
  );
  assert.equal(
    (
      await call(
        "/print/ack",
        "POST",
        {
          id: claim.job.id,
          claim: claim.job.claim,
          status: "submitted",
          receipt: "fixture-only",
        },
        printer,
      )
    ).status,
    200,
  );
  const jobs = await (await call("/jobs")).json();
  assert.equal(jobs[0].status, "submitted");
  console.log(
    "Cloudflare runtime: auth, SQLite storage, settings, feed, edition, claim, duplicate prevention, acknowledgement PASS",
  );
} finally {
  await mf.dispose();
}
