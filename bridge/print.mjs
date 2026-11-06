import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
const exec = promisify(execFile);
export function printArgs(printer, pdf, job) {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(printer) || printer.startsWith("-"))
    throw Error("Use the installed CUPS queue name from lpstat -p");
  if (
    !["Letter", "A4"].includes(job.paper) ||
    !["mono", "color"].includes(job.color)
  )
    throw Error("Invalid print options");
  const duplex = job.duplex || "one-sided";
  const profile = job.printerProfile || "generic";
  if (
    !["one-sided", "two-sided-long-edge", "two-sided-short-edge"].includes(
      duplex,
    ) ||
    !["generic", "brother-hl-l2460dw"].includes(profile)
  )
    throw Error("Invalid printer settings");
  const mono = profile === "brother-hl-l2460dw" || job.color === "mono";
  return [
    "-d",
    printer,
    "-n",
    "1",
    "-t",
    `Morning Edition ${job.id}`,
    "-o",
    `media=${job.paper}`,
    "-o",
    `print-color-mode=${mono ? "monochrome" : "color"}`,
    "-o",
    `sides=${duplex}`,
    "--",
    pdf,
  ];
}
export async function runBridge({
  base,
  token,
  printer,
  directory,
  dryRun = false,
  fetcher = fetch,
  render,
  submit = async (args) => {
    const r = await exec("/usr/bin/lp", args, { timeout: 30000 });
    return r.stdout.trim();
  },
}) {
  const url = new URL(base);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw Error("HTTPS required");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Use the deployment origin only");
  if (!token || token.length < 32) throw Error("Print token required");
  printArgs(printer, "/unused.pdf", {
    id: "validation",
    paper: "Letter",
    color: "mono",
  });
  if (dryRun)
    return {
      status: "dry-run",
      message:
        "No network, journal, claim, or print changes. Use the UI to download a sample PDF.",
    };
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // File locking prevents overlapping runs on this machine. A crash leaves the lock for human inspection.
  let lock;
  try {
    lock = await open(resolve(dir, "bridge.lock"), "wx", 0o600);
  } catch {
    throw Error(
      "Bridge already running or previous run interrupted; inspect bridge.lock before retrying",
    );
  }
  const api = async (path, body) => {
    const r = await fetcher(new URL("/api/print/" + path, url), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw Object.assign(Error(`Print service returned ${r.status}`), {
        status: r.status,
      });
    return r.json();
  };
  const statePath = resolve(dir, "journal.json");
  let journal = {};
  const save = async () => {
    await writeFile(statePath + ".tmp", JSON.stringify(journal), {
      mode: 0o600,
    });
    await rename(statePath + ".tmp", statePath);
  };
  try {
    try {
      journal = JSON.parse(await readFile(statePath, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    // Acknowledgement retries never call lp again.
    for (const [id, j] of Object.entries(journal))
      if (j.ackPending) {
        try {
          await api("ack", {
            id,
            claim: j.claim,
            status: j.status,
            receipt: j.receipt,
          });
        } catch (err) {
          if (err.status !== 409) throw err;
          // Owner reset the claim or retention removed the job. Never resubmit the old copy.
          j.receipt =
            "Old acknowledgement retired after the claim changed or expired.";
        }
        j.ackPending = false;
        await save();
      }
    const { job, html } = await api("claim", {});
    if (!job) return { status: "idle" };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(job.id) ||
      typeof job.claim !== "string" ||
      typeof html !== "string" ||
      html.length > 1000000
    )
      throw Error("Invalid job");
    const key = job.id;
    // Each server claim is unique; a second copy requires an explicit owner reprint.
    journal[key] = {
      claim: job.claim,
      status: "uncertain",
      ackPending: true,
      receipt: "Interrupted before completion",
    };
    await save();
    const pdf = resolve(dir, job.id + ".pdf");
    let attempted = false;
    try {
      const args = printArgs(printer, pdf, job);
      await render(html, pdf, job);
      attempted = true;
      const receipt = await submit(args);
      journal[key] = {
        claim: job.claim,
        status: "submitted",
        ackPending: true,
        receipt,
      };
      await save();
    } catch {
      journal[key] = {
        claim: job.claim,
        status: attempted ? "uncertain" : "failed",
        ackPending: true,
        receipt: attempted
          ? "Submission outcome unknown. Inspect printer queue before reprinting."
          : "PDF rendering failed; no print submitted.",
      };
      await save();
    }
    await api("ack", { id: key, ...journal[key] });
    journal[key].ackPending = false;
    await save();
    await unlink(pdf).catch(() => {});
    return { status: journal[key].status, id: key };
  } finally {
    await lock.close();
    await unlink(resolve(dir, "bridge.lock"));
  }
}
export async function renderPDF(html, path, job) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.pdf({
      path,
      format: job.paper,
      printBackground: job.color === "color",
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const result = await runBridge({
      base: process.env.PRESS_URL,
      token: process.env.PRINT_TOKEN,
      printer: process.env.PRINTER_NAME,
      directory: process.env.PRESS_STATE_DIR || "bridge-state",
      dryRun: process.argv.includes("--dry-run"),
      render: renderPDF,
    });
    console.log(JSON.stringify(result));
    if (["failed", "uncertain"].includes(result.status)) process.exitCode = 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
