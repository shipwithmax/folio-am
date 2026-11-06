import { rssCatalog, printerProfiles } from "./catalog.mjs";
import {
  newModule,
  validateModules,
  voices,
  focusMatches,
  editorialText,
} from "./modules.mjs";
export const sections = [
  "priorities",
  "schedule",
  "email",
  "tasks",
  "headlines",
  "markets",
  "weather",
  "messages",
  "facts",
  "notes",
];
export const defaults = {
  name: "The Daily Palmer",
  tagline: "A little perspective. A clear plan.",
  owner: "Max",
  city: "Houston",
  style: "metropolitan",
  font: "georgia",
  color: "mono",
  paper: "Letter",
  timezone: "America/Chicago",
  time: "07:00",
  enabled: false,
  sections: ["priorities", "schedule", "email", "tasks", "facts", "notes"],
  maxItems: 6,
  emailSnippets: false,
  topics: ["science", "technology", "local"],
  weatherLatitude: "",
  weatherLongitude: "",
  weatherUnits: "fahrenheit",
  weatherPlan: "personal",
  modules: null,
  voice: "original",
  readingLength: "full",
  focus: "",
  columns: 2,
  density: "balanced",
  fontScale: 100,
  accent: "forest",
  showSources: true,
  rssSources: [],
  printerProfile: "generic",
  duplex: "one-sided",
  headingFont: "inherit",
  mastheadScale: 100,
  lineHeight: 145,
  ruleStyle: "classic",
};
export const styles = {
  metropolitan: "Metropolitan",
  journal: "Financial Journal",
  coast: "West Coast",
};
export const fonts = {
  georgia: "Georgia, serif",
  times: '"Times New Roman", serif',
  palatino: 'Palatino, "Palatino Linotype", serif',
  baskerville: 'Baskerville, "Baskerville Old Face", Georgia, serif',
  charter: 'Charter, "Bitstream Charter", Georgia, serif',
  garamond: 'Garamond, "Apple Garamond", Georgia, serif',
  arial: "Arial, Helvetica, sans-serif",
  courier: '"Courier New", Courier, monospace',
};
export function localClock(now, timezone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
export function validateConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Settings must be an object");
  const c = { ...defaults, ...input };
  for (const [k, max] of [
    ["name", 64],
    ["tagline", 120],
    ["owner", 40],
    ["city", 60],
  ])
    if (typeof c[k] !== "string" || !c[k].trim() || c[k].length > max)
      throw new Error(`Invalid ${k}`);
  if (
    !Object.hasOwn(styles, c.style) ||
    !Object.hasOwn(fonts, c.font) ||
    !["mono", "color"].includes(c.color) ||
    !["Letter", "A4"].includes(c.paper)
  )
    throw new Error("Invalid print style");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time))
    throw new Error("Invalid delivery time");
  try {
    if (typeof c.timezone !== "string" || !c.timezone.trim()) throw Error();
    localClock(new Date(), c.timezone);
  } catch {
    throw new Error("Invalid timezone");
  }
  if (
    !Array.isArray(c.sections) ||
    c.sections.some((x) => !sections.includes(x)) ||
    new Set(c.sections).size !== c.sections.length
  )
    throw new Error("Invalid sections");
  if (
    !Array.isArray(c.topics) ||
    c.topics.length > 12 ||
    c.topics.some((t) => typeof t !== "string" || !/^[-a-z0-9 ]{1,40}$/.test(t))
  )
    throw new Error(
      "Use up to 12 topics with letters, numbers, spaces or hyphens",
    );
  if (!Number.isInteger(c.maxItems) || c.maxItems < 1 || c.maxItems > 12)
    throw new Error("Item limit must be 1–12");
  if (typeof c.enabled !== "boolean" || typeof c.emailSnippets !== "boolean")
    throw new Error("Invalid settings");
  for (const [key, bound] of [
    ["weatherLatitude", 90],
    ["weatherLongitude", 180],
  ]) {
    const v = c[key];
    if (
      typeof v !== "string" ||
      (v !== "" &&
        (!v.trim() ||
          !Number.isFinite(Number(v)) ||
          Math.abs(Number(v)) > bound))
    )
      throw Error("Invalid weather coordinates");
  }
  if (
    !["fahrenheit", "celsius"].includes(c.weatherUnits) ||
    !["personal", "commercial"].includes(c.weatherPlan)
  )
    throw Error("Invalid weather settings");
  if (
    !Object.hasOwn(voices, c.voice) ||
    !["headlines", "short", "full"].includes(c.readingLength) ||
    typeof c.focus !== "string" ||
    c.focus.length > 200 ||
    ![1, 2, 3].includes(c.columns) ||
    !["compact", "balanced", "airy"].includes(c.density) ||
    !Number.isInteger(c.fontScale) ||
    c.fontScale < 85 ||
    c.fontScale > 130 ||
    !["forest", "oxblood", "navy", "sepia"].includes(c.accent) ||
    typeof c.showSources !== "boolean"
  )
    throw Error("Invalid edition presentation");
  if (
    !Array.isArray(c.rssSources) ||
    c.rssSources.some((id) => !rssCatalog.some((p) => p.id === id)) ||
    new Set(c.rssSources).size !== c.rssSources.length
  )
    throw Error("Invalid RSS source selection");
  if (
    !Object.hasOwn(printerProfiles, c.printerProfile) ||
    !["one-sided", "two-sided-long-edge", "two-sided-short-edge"].includes(
      c.duplex,
    )
  )
    throw Error("Invalid printer profile");
  if (c.printerProfile === "brother-hl-l2460dw") c.color = "mono";
  if (
    (c.headingFont !== "inherit" && !Object.hasOwn(fonts, c.headingFont)) ||
    !Number.isInteger(c.mastheadScale) ||
    c.mastheadScale < 75 ||
    c.mastheadScale > 130 ||
    !Number.isInteger(c.lineHeight) ||
    c.lineHeight < 120 ||
    c.lineHeight > 180 ||
    !["classic", "light", "heavy"].includes(c.ruleStyle)
  )
    throw Error("Invalid typography");
  c.modules = validateModules(
    c.modules === null
      ? c.sections.map((type, index) => ({
          ...newModule(type, index),
          limit: type === "priorities" ? 3 : c.maxItems,
        }))
      : c.modules,
  );
  c.sections = [
    ...new Set(c.modules.filter((m) => m.enabled).map((m) => m.type)),
  ];
  return structuredClone(
    Object.fromEntries(Object.keys(defaults).map((k) => [k, c[k]])),
  );
}
function validDay(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function normalizeFeed(input, now = new Date()) {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray(input.items) ||
    input.items.length > 150
  )
    throw new Error("Feed requires up to 150 items");
  const str = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
  const stamp = input.updatedAt ? new Date(input.updatedAt) : now;
  if (!Number.isFinite(+stamp) || +stamp > +now + 300000)
    throw new Error("Invalid feed timestamp");
  return {
    updatedAt: stamp.toISOString(),
    items: input.items.map((i, index) => {
      if (
        !i ||
        !sections.includes(i.kind) ||
        typeof i.title !== "string" ||
        !i.title.trim()
      )
        throw new Error("Every item needs a valid kind and title");
      const url = str(i.url, 1000);
      if (url) {
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          throw Error("Invalid source link");
        }
        if (
          !["http:", "https:"].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password
        )
          throw Error("Links must use HTTP or HTTPS without credentials");
      }
      const due = str(i.due, 10);
      if (due && !validDay(due)) throw new Error("Due date must be YYYY-MM-DD");
      const start = str(i.start, 40),
        end = str(i.end, 40);
      if (
        (start && !Number.isFinite(Date.parse(start))) ||
        (end && !Number.isFinite(Date.parse(end)))
      )
        throw new Error("Invalid event date");
      if (i.kind === "schedule" && !start)
        throw new Error("Schedule items need a start");
      if (i.kind === "schedule") {
        for (const value of [start, end].filter(Boolean)) {
          if (
            i.allDay === true
              ? !validDay(value)
              : !validDay(value.slice(0, 10)) ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
                  value,
                )
          )
            throw Error(
              "Use a calendar date for all-day events, or a timestamp with timezone for timed events",
            );
        }
        if (end && Date.parse(end) <= Date.parse(start))
          throw Error("Event end must be after its start");
      }
      return {
        id: str(i.id, 100) || `item-${index}`,
        kind: i.kind,
        title: str(i.title, 180),
        detail: str(i.detail, 400),
        source: str(i.source, 60) || "Custom feed",
        url,
        due,
        start,
        end,
        priority: [1, 2, 3].includes(i.priority) ? i.priority : 3,
        done: i.done === true,
        allDay: i.allDay === true,
        topic: str(i.topic, 40).toLowerCase(),
        publishedAt:
          typeof i.publishedAt === "string" &&
          Number.isFinite(Date.parse(i.publishedAt))
            ? new Date(i.publishedAt).toISOString()
            : "",
      };
    }),
  };
}
export function edition(config, feeds, now = new Date(), demo = false) {
  const c = validateConfig(config),
    clock = localClock(now, c.timezone),
    warnings = [],
    sourceStatus = [];
  const items = [];
  const active = c.modules.filter((m) => m.enabled && m.type !== "notes");
  for (const [source, feed] of Object.entries(feeds)) {
    if (
      !active.some((m) => m.sourceIds === null || m.sourceIds.includes(source))
    )
      continue;
    const stamp = Date.parse(feed.updatedAt);
    const stale =
      !Number.isFinite(stamp) ||
      stamp > +now + 300000 ||
      +now - stamp > 36 * 3600000;
    sourceStatus.push({
      source,
      updatedAt: feed.updatedAt || null,
      status: feed.error ? "unavailable" : stale ? "stale" : "ready",
    });
    if (feed.error || stale) {
      warnings.push(
        `${source}: ${feed.error ? "unavailable" : "older than 36 hours"}; excluded from this edition.`,
      );
      continue;
    }
    items.push(
      ...feed.items
        .filter((i) => !i.done)
        .map((i) => ({ ...i, feedId: source })),
    );
  }
  const seen = new Set();
  const unique = items.filter((i) => {
    const k = `${i.kind}:${i.feedId}:${i.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const relevant = unique.filter((i) => {
    if (
      i.kind === "headlines" &&
      i.topic &&
      c.topics.length &&
      !c.topics.includes(i.topic)
    )
      return false;
    if (i.kind !== "schedule") return true;
    const start = i.allDay
      ? i.start.slice(0, 10)
      : localClock(new Date(i.start), c.timezone).date;
    const end = i.end
      ? i.allDay
        ? new Date(Date.parse(i.end) - 1).toISOString().slice(0, 10)
        : localClock(new Date(Date.parse(i.end) - 1), c.timezone).date
      : start;
    return start <= clock.date && end >= clock.date;
  });
  const score = (i, m) =>
    (i.due && i.due <= clock.date ? 100 : 0) +
    (4 - i.priority) * 10 +
    focusMatches(i, c.focus + " , " + m.focus) * 150;
  const groups = {};
  const modules = c.modules
    .filter((m) => m.enabled)
    .map((m) => {
      let rows = relevant.filter(
        (i) =>
          i.kind === m.type ||
          (m.type === "priorities" &&
            i.kind === "tasks" &&
            (!i.due || i.due <= clock.date)),
      );
      if (m.sourceIds !== null)
        rows = rows.filter((i) => m.sourceIds.includes(i.feedId));
      if (m.focusMode === "only" && m.focus.trim())
        rows = rows.filter((i) => focusMatches(i, m.focus) > 0);
      rows.sort(
        m.type === "schedule"
          ? (a, b) => Date.parse(a.start) - Date.parse(b.start)
          : (a, b) =>
              score(b, m) - score(a, m) ||
              (m.type === "headlines"
                ? (Date.parse(b.publishedAt) || 0) -
                  (Date.parse(a.publishedAt) || 0)
                : 0) ||
              a.title.localeCompare(b.title),
      );
      const selected = rows
        .slice(0, m.limit)
        .map((i) => editorialText(i, m, c));
      const result = {
        ...m,
        items: selected,
        omitted: Math.max(0, rows.length - m.limit),
      };
      if (!groups[m.type])
        groups[m.type] = { items: selected, omitted: result.omitted };
      return result;
    });
  const missing = new Set(
    active
      .flatMap((m) => m.sourceIds || [])
      .filter((id) => !Object.hasOwn(feeds, id)),
  );
  for (const source of missing)
    warnings.push(
      `${source}: selected but not connected; excluded from this edition.`,
    );
  if (!Object.keys(feeds).length && active.some((m) => m.sourceIds === null))
    warnings.push(
      "No sources connected. Add your tasks or connect a source before scheduling.",
    );
  return {
    id: clock.date,
    date: clock.date,
    generatedAt: now.toISOString(),
    config: c,
    groups,
    modules,
    warnings,
    sourceStatus,
    demo,
  };
}
export function sampleFeed(now = new Date()) {
  const d = localClock(now, "America/Chicago").date;
  return normalizeFeed(
    {
      items: [
        {
          kind: "weather",
          title: "Partly cloudy · 76°F",
          detail: "Sample forecast only. Low 61°F · Rain chance 20%.",
          source: "Example weather",
        },
        {
          kind: "messages",
          title: "Could you review the notes before our call?",
          detail:
            "Example message from a selected chat. Review before treating it as a task.",
          source: "Example Beeper chat",
        },
        {
          kind: "tasks",
          title: "Finish the one thing that moves today forward",
          detail: "Protect a focused hour before opening your inbox.",
          priority: 1,
          due: d,
          source: "Example tasks",
        },
        {
          kind: "tasks",
          title: "Close the loop on yesterday’s conversation",
          detail: "Send the promised next step and make the owner clear.",
          priority: 2,
          due: d,
          source: "Example tasks",
        },
        {
          kind: "tasks",
          title: "Make room for a proper lunch break",
          detail: "Step away. Come back with a fresh perspective.",
          priority: 3,
          due: d,
          source: "Example tasks",
        },
        {
          kind: "schedule",
          title: "A quiet hour for the important work",
          start: `${d}T09:00:00-05:00`,
          end: `${d}T10:00:00-05:00`,
          detail: "Focus time · no meetings",
          source: "Example calendar",
        },
        {
          kind: "schedule",
          title: "Project check-in",
          start: `${d}T11:30:00-05:00`,
          end: `${d}T12:00:00-05:00`,
          detail: "Review decisions, owners, and next steps",
          source: "Example calendar",
        },
        {
          kind: "schedule",
          title: "Afternoon walk",
          start: `${d}T16:00:00-05:00`,
          end: `${d}T16:30:00-05:00`,
          detail: "A little fresh air",
          source: "Example calendar",
        },
        {
          kind: "email",
          title: "A proposal ready for your review",
          detail:
            "Example message: a collaborator is waiting on two decisions.",
          source: "Example inbox",
          priority: 1,
        },
        {
          kind: "email",
          title: "Tomorrow’s meeting: a short reading list",
          detail: "Example message: skim the brief before you arrive.",
          source: "Example inbox",
          priority: 2,
        },
        {
          kind: "facts",
          title: "The space between the lines",
          detail:
            "In typography, “leading” is the distance between lines of type, named for the strips of lead once used to separate them.",
          source: "Typography note",
        },
        {
          kind: "headlines",
          title: "Choose the world you want to wake up to",
          detail:
            "Connect an approved feed for science, local news, culture, or the topics you care about.",
          source: "Example section",
        },
        {
          kind: "markets",
          title: "Your watchlist, with a timestamp",
          detail:
            "No live prices connected. Your market provider can supply attributed, timestamped quotes here.",
          source: "Example section",
        },
      ],
    },
    now,
  );
}
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function sampleFeeds(now = new Date(), config = defaults) {
  const feed = sampleFeed(now);
  const map = {
    tasks: "My tasks",
    priorities: "My tasks",
    schedule: "Google Calendar",
    email: "Gmail",
    messages: "Beeper",
    weather: "Open-Meteo",
    headlines: "Reading list",
    facts: "Reading list",
    markets: "Watchlist",
  };
  const feeds = {};
  for (const item of feed.items) {
    const id = map[item.kind] || "Sample";
    feeds[id] ??= { updatedAt: feed.updatedAt, items: [] };
    feeds[id].items.push(item);
  }
  for (const p of rssCatalog.filter((p) =>
    (config.rssSources || []).includes(p.id),
  ))
    feeds[p.name] = normalizeFeed(
      {
        items: [
          {
            id: "rss-sample-" + p.id,
            kind: "headlines",
            title: p.name + " · sample headline",
            detail:
              "Fictional sample. Turn off Sample data to retrieve the publisher’s public headlines.",
            source: p.name + " (sample)",
            topic: p.topic,
          },
        ],
      },
      now,
    );
  return feeds;
}
