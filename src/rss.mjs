import { XMLParser, XMLValidator } from "fast-xml-parser";
import { rssCatalog } from "../public/catalog.mjs";
import { normalizeFeed } from "../public/core.mjs";
import { usesSource } from "../public/modules.mjs";
const MAX_BYTES = 1024 * 1024;
const array = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const scalar = (v) =>
  typeof v === "object" && v !== null ? v["#text"] || "" : String(v ?? "");
function plain(v) {
  return scalar(v)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseRss(xml, provider, now = new Date()) {
  if (
    new TextEncoder().encode(xml).length > MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw Error("Unsupported feed document");
  if (XMLValidator.validate(xml) !== true) throw Error("Malformed RSS");
  const data = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    processEntities: true,
    htmlEntities: false,
  }).parse(xml);
  if (!data.rss?.channel && !data.feed) throw Error("Expected RSS or Atom");
  const entries = array(data.rss?.channel?.item ?? data.feed?.entry);
  const seen = new Set(),
    items = [];
  for (const row of entries.slice(0, 150)) {
    const title = plain(row.title);
    const link =
      typeof row.link === "string"
        ? row.link
        : array(row.link).find(
            (x) => !x["@_rel"] || x["@_rel"] === "alternate",
          )?.["@_href"];
    let url;
    try {
      url = new URL(link);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        continue;
    } catch {
      continue;
    }
    const stamp = Date.parse(
      scalar(row.pubDate ?? row.published ?? row.updated),
    );
    if (
      Number.isFinite(stamp) &&
      (stamp > +now + 300000 || +now - stamp > 7 * 86400000)
    )
      continue;
    const id = scalar(row.guid ?? row.id) || url.href;
    if (!title || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      kind: "headlines",
      title,
      detail: plain(row.description ?? row.summary).slice(0, 280),
      source: provider.name,
      topic: provider.topic,
      url: url.href,
      publishedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : "",
    });
  }
  return normalizeFeed({ items }, now);
}
async function boundedText(response) {
  if (Number(response.headers.get("Content-Length")) > MAX_BYTES)
    throw Error("Feed too large");
  if (!response.body) throw Error("Empty feed");
  const reader = response.body.getReader();
  let length = 0;
  const parts = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        throw Error("Feed too large");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function rssFeeds(
  config,
  now = new Date(),
  fetcher = fetch,
  cache = new Map(),
) {
  const selected = rssCatalog.filter(
    (p) =>
      (config.rssSources || []).includes(p.id) &&
      usesSource(config, "headlines", p.name),
  );
  return Object.fromEntries(
    await Promise.all(
      selected.map(async (provider) => {
        const cached = cache.get(provider.id);
        if (cached && +now - cached.at < 600000)
          return [provider.name, cached.feed];
        try {
          const response = await fetcher(provider.url, {
            redirect: "error",
            signal: AbortSignal.timeout(10000),
            headers: {
              Accept: "application/rss+xml, application/atom+xml, text/xml",
            },
          });
          if (!response.ok) throw Error("Feed unavailable");
          const feed = parseRss(await boundedText(response), provider, now);
          cache.set(provider.id, { at: +now, feed });
          return [provider.name, feed];
        } catch {
          return [
            provider.name,
            { error: true, items: [], updatedAt: now.toISOString() },
          ];
        }
      }),
    ),
  );
}
