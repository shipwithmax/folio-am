import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeFeed } from "../public/core.mjs";
// Local-only reader. This module has no cloud upload or messaging mutation path.
export async function collectBeeper({
  token,
  chatIDs,
  now = new Date(),
  fetcher = fetch,
}) {
  if (typeof token !== "string" || !token)
    throw Error("Beeper access token required");
  if (
    !Array.isArray(chatIDs) ||
    !chatIDs.length ||
    chatIDs.length > 20 ||
    chatIDs.some((id) => typeof id !== "string" || !id.trim())
  )
    throw Error("Choose 1–20 explicit Beeper chat IDs");
  const allowed = new Set(chatIDs);
  const seen = new Set();
  const items = [];
  let cursor;
  const cutoff = new Date(+now - 24 * 3600000).toISOString();
  for (let page = 0; page < 10; page++) {
    const url = new URL("http://127.0.0.1:23373/v1/messages/search");
    url.search = new URLSearchParams({
      dateAfter: cutoff,
      dateBefore: now.toISOString(),
      sender: "others",
      includeMuted: "false",
      excludeLowPriority: "true",
      limit: "20",
    });
    for (const id of allowed) url.searchParams.append("chatIDs", id);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
      url.searchParams.set("direction", "before");
    }
    const response = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error(`Beeper returned ${response.status}; no feed written`);
    const body = await response.json();
    if (!Array.isArray(body.items)) throw Error("Unexpected Beeper response");
    for (const m of body.items) {
      if (
        !allowed.has(m.chatID) ||
        m.isSender ||
        m.isDeleted ||
        m.isHidden ||
        typeof m.text !== "string" ||
        !m.text.trim() ||
        typeof m.id !== "string"
      )
        continue;
      const timestamp = Date.parse(m.timestamp);
      if (
        !Number.isFinite(timestamp) ||
        timestamp <= Date.parse(cutoff) ||
        timestamp > +now
      )
        continue;
      const key = `${m.chatID}:${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const chat = body.chats?.[m.chatID];
      items.push({
        id: key,
        kind: "messages",
        title: m.text.slice(0, 180),
        detail: `Received ${m.timestamp}. Review in Beeper; this is a message, not an inferred commitment.`,
        source:
          typeof chat?.title === "string" ? `Beeper · ${chat.title}` : "Beeper",
        priority: 3,
      });
      if (items.length > 150)
        throw Error(
          "Too many messages; narrow the selected chats before exporting",
        );
    }
    if (!body.hasMore)
      return { name: "Beeper", ...normalizeFeed({ items }, now) };
    if (!body.oldestCursor || body.oldestCursor === cursor)
      throw Error("Beeper pagination did not advance");
    cursor = body.oldestCursor;
  }
  throw Error(
    "Message search limit reached; narrow the selected chats before exporting",
  );
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const outIndex = process.argv.indexOf("--out");
    if (outIndex < 0 || !process.argv[outIndex + 1])
      throw Error("Provide --out with a private local JSON file path");
    const feed = await collectBeeper({
      token: process.env.BEEPER_ACCESS_TOKEN,
      chatIDs: (process.env.BEEPER_CHAT_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    const path = resolve(process.argv[outIndex + 1]);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify(feed, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      `Exported ${feed.items.length} messages locally. Nothing uploaded or sent.`,
    );
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
