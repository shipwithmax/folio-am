import { rssFeeds } from "./rss.mjs";
import { rssCatalog } from "../public/catalog.mjs";
import { usesSource } from "../public/modules.mjs";
import {
  defaults,
  validateConfig,
  normalizeFeed,
  edition,
  localClock,
  sampleFeeds,
} from "../public/core.mjs";
import { renderDocument } from "../public/render.mjs";
import { weatherFeed } from "./weather.mjs";
import { googleFeeds } from "./google.mjs";
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export async function readJSON(req) {
  const reader = req.body?.getReader();
  if (!reader) throw Error("JSON body required");
  let size = 0;
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 200000) {
      await reader.cancel();
      throw Error("Request too large");
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export async function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const hash = async (s) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function signature(payload, key) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(payload)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function authorize(req, env, role = "admin") {
  if (env.LOCAL_DEMO === true) return role === "admin";
  const secret = role === "print" ? env.PRINT_TOKEN : env.ADMIN_TOKEN;
  if (
    !secret ||
    secret.length < 32 ||
    (role === "print" && secret === env.ADMIN_TOKEN)
  )
    return false;
  const bearer = req.headers.get("Authorization");
  if (bearer?.startsWith("Bearer ")) return equal(bearer.slice(7), secret);
  if (role === "print") return false;
  const cookie = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)press_session=([^;]+)/)?.[1];
  if (!cookie) return false;
  const [exp, sig] = cookie.split(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return equal(sig, await signature(exp, secret));
}
export class PressService {
  constructor(storage, env = {}, fetcher = fetch) {
    this.storage = storage;
    this.env = env;
    this.fetcher = fetcher;
    this.queue = Promise.resolve();
    this.rssCache = new Map();
  }
  serial(fn) {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  async config() {
    return validateConfig((await this.storage.get("config")) || defaults);
  }
  async feeds() {
    return (await this.storage.get("feeds")) || {};
  }
  async collect(config, now) {
    const [google, weather, rss] = await Promise.all([
      googleFeeds(this.env, config, now, this.fetcher),
      weatherFeed(this.env, config, now, this.fetcher),
      rssFeeds(config, now, this.fetcher, this.rssCache),
    ]);
    const direct = { ...google, ...weather, ...rss };
    for (const [section, name] of [
      ["email", "Gmail"],
      ["schedule", "Google Calendar"],
    ])
      if (usesSource(config, section, name) && !direct[name])
        direct[name] = { error: true, items: [], updatedAt: now.toISOString() };
    return { ...(await this.feeds()), ...direct };
  }
  async generate(now = new Date()) {
    const config = await this.config(),
      date = localClock(now, config.timezone).date;
    const old = await this.storage.get("edition:" + date);
    if (old) return old;
    const ed = edition(config, await this.collect(config, now), now);
    const job = {
      id: date,
      status: "pending",
      createdAt: now.toISOString(),
      paper: config.paper,
      color: config.color,
      duplex: config.duplex,
      printerProfile: config.printerProfile,
    };
    await this.storage.put({ ["edition:" + date]: ed, ["job:" + date]: job });
    await this.cleanup(now);
    return ed;
  }
  async cleanup(now) {
    const cutoff = new Date(+now - 14 * 86400000).toISOString().slice(0, 10);
    for (const prefix of ["edition:", "job:"]) {
      const rows = await this.storage.list({ prefix });
      for (const k of rows.keys())
        if (k.slice(prefix.length) < cutoff) await this.storage.delete(k);
    }
  }
  async tick(now = new Date()) {
    await this.cleanup(now);
    const c = await this.config(),
      clock = localClock(now, c.timezone);
    if (!c.enabled) return { status: "paused" };
    const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    // The next five-minute tick can cross midnight for a 23:59 schedule.
    const delta = (mins(clock.time) - mins(c.time) + 1440) % 1440;
    if (delta > 60) return { status: "outside-window" };
    await this.generate(now);
    return { status: "ready", date: clock.date };
  }
  async handle(req) {
    return this.serial(async () => {
      try {
        return await this.route(req);
      } catch (err) {
        return json(
          {
            error:
              err instanceof SyntaxError
                ? "Invalid JSON"
                : err.message || "Request failed",
          },
          400,
        );
      }
    });
  }
  async route(req) {
    const url = new URL(req.url),
      p = url.pathname,
      m = req.method;
    if (m !== "GET" && m !== "HEAD") {
      const origin = req.headers.get("Origin");
      if (origin && origin !== url.origin)
        return json({ error: "Origin rejected" }, 403);
    }
    if (p === "/api/login" && m === "POST") {
      const body = await readJSON(req);
      if (
        !this.env.ADMIN_TOKEN ||
        this.env.ADMIN_TOKEN.length < 32 ||
        !(await equal(body.token, this.env.ADMIN_TOKEN))
      )
        return json({ error: "Invalid access key" }, 401);
      const exp = String(Date.now() + 8 * 3600000),
        sig = await signature(exp, this.env.ADMIN_TOKEN);
      return json({ ok: true }, 200, {
        "Set-Cookie": `press_session=${exp}.${sig}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`,
      });
    }
    if (p === "/api/logout" && m === "POST")
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "press_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
      });
    const print = p.startsWith("/api/print/");
    if (!(await authorize(req, this.env, print ? "print" : "admin")))
      return json({ error: "Sign in required" }, 401);
    if (p === "/api/config" && m === "GET")
      return json({
        config: await this.config(),
        localDemo: this.env.LOCAL_DEMO === true,
        googleConfigured: !!(
          this.env.GOOGLE_CLIENT_ID &&
          this.env.GOOGLE_CLIENT_SECRET &&
          this.env.GOOGLE_REFRESH_TOKEN
        ),
        feeds: Object.entries(await this.feeds()).map(([name, f]) => ({
          name,
          updatedAt: f.updatedAt,
          count: f.items.length,
          types: [...new Set(f.items.map((i) => i.kind))],
        })),
      });
    if (p === "/api/feeds" && m === "GET") {
      const name = new URL(req.url).searchParams.get("name");
      const feeds = await this.feeds();
      if (!name || !Object.hasOwn(feeds, name))
        return json({ error: "Source not found" }, 404);
      return json({ name, ...feeds[name] });
    }
    if (p === "/api/config" && m === "PUT") {
      const c = validateConfig(await readJSON(req));
      await this.storage.put("config", c);
      return json({ config: c });
    }
    if (p === "/api/preview" && m === "POST") {
      const b = await readJSON(req),
        c = validateConfig(b.config || (await this.config())),
        now = new Date();
      return json(
        edition(
          c,
          b.demo === true ? sampleFeeds(now, c) : await this.collect(c, now),
          now,
          b.demo === true,
        ),
      );
    }
    if (p === "/api/feeds" && m === "POST") {
      const b = await readJSON(req);
      if (
        typeof b.name !== "string" ||
        !/^[a-zA-Z0-9 _-]{1,40}$/.test(b.name) ||
        [
          ...rssCatalog.map((p) => p.name),
          "Gmail",
          "Google Calendar",
          "Open-Meteo",
          "__proto__",
          "constructor",
          "prototype",
        ].includes(b.name)
      )
        throw Error(
          "Choose a source name (1–40 letters, numbers, spaces, _ or -)",
        );
      const feeds = await this.feeds();
      if (!Object.hasOwn(feeds, b.name) && Object.keys(feeds).length >= 10)
        throw Error("Maximum 10 custom feeds");
      feeds[b.name] = normalizeFeed(b);
      // SQLite Durable Object key/value pairs have a 2 MB ceiling. Leave headroom
      // for the storage serializer and reject before replacing existing data.
      if (new TextEncoder().encode(JSON.stringify(feeds)).length > 1500000)
        throw Error(
          "Imported sources are too large. Remove older sources or shorten their excerpts before importing.",
        );
      await this.storage.put("feeds", feeds);
      return json({ ok: true });
    }
    if (p === "/api/feeds" && m === "DELETE") {
      const b = await readJSON(req),
        feeds = await this.feeds();
      delete feeds[b.name];
      await this.storage.put("feeds", feeds);
      return json({ ok: true });
    }
    if (p === "/api/generate" && m === "POST") {
      if (this.env.LOCAL_DEMO === true)
        return json(
          { error: "Local preview cannot queue real print jobs" },
          409,
        );
      return json(await this.generate());
    }
    if (p === "/api/jobs" && m === "GET") {
      const jobs = await this.storage.list({ prefix: "job:" });
      return json([...jobs.values()].reverse());
    }
    if (p === "/api/print/claim" && m === "POST") {
      const today = localClock(new Date(), (await this.config()).timezone).date;
      const job = await this.storage.get("job:" + today);
      if (!job || job.status !== "pending") return json({ job: null });
      job.status = "claimed";
      job.claim = crypto.randomUUID();
      job.claimedAt = new Date().toISOString();
      await this.storage.put("job:" + today, job);
      return json({
        job,
        html: renderDocument(await this.storage.get("edition:" + today)),
      });
    }
    if (p === "/api/print/ack" && m === "POST") {
      const b = await readJSON(req);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(b.id) ||
        !["submitted", "uncertain", "failed"].includes(b.status)
      )
        throw Error("Invalid acknowledgement");
      const job = await this.storage.get("job:" + b.id);
      if (!job || !(await equal(job.claim, b.claim)))
        return json({ error: "Unknown claim" }, 409);
      if (job.status !== "claimed") return json({ job });
      job.status = b.status;
      job.finishedAt = new Date().toISOString();
      job.receipt =
        typeof b.receipt === "string" ? b.receipt.slice(0, 180) : "";
      await this.storage.put("job:" + b.id, job);
      return json({ job });
    }
    if (p === "/api/jobs/retry" && m === "POST") {
      const b = await readJSON(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.id) || b.confirm !== true)
        throw Error("Explicit reprint confirmation required");
      const job = await this.storage.get("job:" + b.id);
      if (!job) throw Error("Job not found");
      if (b.id !== localClock(new Date(), (await this.config()).timezone).date)
        throw Error("Only today’s edition can be reprinted");
      job.status = "pending";
      delete job.claim;
      job.reprintRequestedAt = new Date().toISOString();
      await this.storage.put("job:" + b.id, job);
      return json({ job });
    }
    return json({ error: "Not found" }, 404);
  }
}
