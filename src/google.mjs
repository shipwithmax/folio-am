import { usesSource } from "../public/modules.mjs";
import { normalizeFeed, localClock } from "../public/core.mjs";
async function json(fetcher, url, options = {}) {
  const r = await fetcher(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("Provider request failed");
  return r.json();
}
export async function googleFeeds(
  env,
  config,
  now = new Date(),
  fetcher = fetch,
) {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REFRESH_TOKEN
  )
    return {};
  const requested = [];
  if (usesSource(config, "email", "Gmail")) requested.push("Gmail");
  if (usesSource(config, "schedule", "Google Calendar"))
    requested.push("Google Calendar");
  if (!requested.length) return {};
  let token;
  try {
    token = await json(fetcher, "https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    if (!token.access_token) throw Error();
  } catch {
    return Object.fromEntries(
      requested.map((k) => [
        k,
        { error: true, items: [], updatedAt: now.toISOString() },
      ]),
    );
  }
  const get = (url) =>
    json(fetcher, url, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
  const tasks = {
    Gmail: async () => {
      const list = await get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
          new URLSearchParams({
            q: "in:inbox newer_than:7d -category:promotions -category:social",
            maxResults: "30",
          }),
      );
      const messages = await Promise.all(
        (list.messages || []).map((m) =>
          get(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          ),
        ),
      );
      return normalizeFeed(
        {
          items: messages.map((m) => {
            const h = (n) =>
              m.payload?.headers?.find((h) => h.name.toLowerCase() === n)
                ?.value || "";
            return {
              id: m.id,
              kind: "email",
              title: h("subject") || "(No subject)",
              detail: config.emailSnippets ? m.snippet || "" : "",
              source: h("from"),
              priority: m.labelIds?.includes("STARRED")
                ? 1
                : m.labelIds?.includes("IMPORTANT")
                  ? 2
                  : 3,
              url: `https://mail.google.com/mail/u/0/#all/${m.id}`,
            };
          }),
        },
        now,
      );
    },
    "Google Calendar": async () => {
      // Broad UTC window, then exact local-day filtering handles DST and all timezone offsets.
      const day = localClock(now, config.timezone).date,
        center = Date.parse(day + "T12:00:00Z");
      const items = [];
      let pageToken;
      for (let page = 0; page < 10; page++) {
        const q = new URLSearchParams({
          timeMin: new Date(center - 40 * 3600000).toISOString(),
          timeMax: new Date(center + 40 * 3600000).toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
          timeZone: config.timezone,
        });
        if (pageToken) q.set("pageToken", pageToken);
        const data = await get(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
            q,
        );
        for (const x of data.items || []) {
          if (x.status === "cancelled") continue;
          if (x.start?.date) {
            if (x.start.date <= day && x.end?.date > day)
              items.push({
                id: x.id,
                kind: "schedule",
                title: x.summary || "Busy",
                start: x.start.date,
                end: x.end.date,
                allDay: true,
                detail: "All day",
                source: "Google Calendar",
                url: x.htmlLink,
              });
          } else if (x.start?.dateTime) {
            const start = localClock(
              new Date(x.start.dateTime),
              config.timezone,
            ).date;
            const end = localClock(
              new Date(Date.parse(x.end?.dateTime || x.start.dateTime) - 1),
              config.timezone,
            ).date;
            if (start <= day && end >= day)
              items.push({
                id: x.id,
                kind: "schedule",
                title: x.summary || "Busy",
                start: x.start.dateTime,
                end: x.end?.dateTime,
                detail: x.location || "",
                source: "Google Calendar",
                url: x.htmlLink,
              });
          }
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
        if (page === 9) throw Error("Calendar pagination limit");
      }
      return normalizeFeed({ items }, now);
    },
  };
  return Object.fromEntries(
    await Promise.all(
      requested.map(async (k) => {
        try {
          return [k, await tasks[k]()];
        } catch {
          return [k, { error: true, items: [], updatedAt: now.toISOString() }];
        }
      }),
    ),
  );
}
