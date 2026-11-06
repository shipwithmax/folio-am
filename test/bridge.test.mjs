import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBridge, printArgs } from "../bridge/print.mjs";
const token = "printer-test-fixture-".repeat(3),
  job = { id: "2026-10-31", claim: "claim-1", paper: "Letter", color: "mono" };
test("printer arguments have no shell interpolation", () => {
  assert.throws(() => printArgs("printer;touch /tmp/no", "/tmp/file.pdf", job));
  const args = printArgs("Brother_HL", "/tmp/file.pdf", job);
  assert.ok(args.includes("print-color-mode=monochrome"));
  assert.equal(args.at(-2), "--");
});
test("lost acknowledgement retries acknowledgement without printing again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "press-test-"));
  let printed = 0,
    claimed = false,
    failAck = true,
    acks = 0;
  const fetcher = async (url) => {
    if (url.pathname.endsWith("/claim")) {
      if (claimed) return Response.json({ job: null });
      claimed = true;
      return Response.json({ job, html: "test" });
    }
    acks++;
    if (failAck) throw Error("Network lost");
    return Response.json({ ok: true });
  };
  const options = {
    base: "https://press.example",
    token,
    printer: "Brother",
    directory: dir,
    fetcher,
    render: async () => {},
    submit: async () => {
      printed++;
      return "Brother-42";
    },
  };
  try {
    await assert.rejects(runBridge(options));
    assert.equal(printed, 1);
    failAck = false;
    await runBridge(options);
    assert.equal(printed, 1);
    assert.equal(acks, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("submission failure becomes uncertain and rendering failure becomes failed", async () => {
  for (const stage of ["render", "submit"]) {
    const dir = await mkdtemp(join(tmpdir(), "press-test-"));
    let acknowledgement;
    try {
      await runBridge({
        base: "https://press.example",
        token,
        printer: "Brother",
        directory: dir,
        fetcher: async (url, o) =>
          url.pathname.endsWith("/claim")
            ? Response.json({ job, html: "test" })
            : ((acknowledgement = JSON.parse(o.body)),
              Response.json({ ok: true })),
        render: async () => {
          if (stage === "render") throw Error();
        },
        submit: async () => {
          throw Error();
        },
      });
      assert.equal(
        acknowledgement.status,
        stage === "render" ? "failed" : "uncertain",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("an owner reset retires an obsolete acknowledgement without blocking new jobs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "press-test-"));
  let claimed = false,
    reset = false,
    printed = 0;
  const options = {
    base: "https://press.example",
    token,
    printer: "Brother",
    directory: dir,
    render: async () => {},
    submit: async () => {
      printed++;
      return "queue-1";
    },
    fetcher: async (url) => {
      if (url.pathname.endsWith("/claim")) {
        if (claimed) return Response.json({ job: null });
        claimed = true;
        return Response.json({ job, html: "test" });
      }
      if (!reset) throw Error("offline");
      return new Response("{}", { status: 409 });
    },
  };
  try {
    await assert.rejects(runBridge(options));
    reset = true;
    assert.equal((await runBridge(options)).status, "idle");
    assert.equal(printed, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
