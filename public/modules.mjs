import { rssCatalog } from "./catalog.mjs";
export const moduleTypes = {
  priorities: {
    name: "Priorities",
    title: "The essential three",
    description: "The work that deserves your best attention.",
    icon: "01",
    category: "Your day",
  },
  schedule: {
    name: "Schedule",
    title: "The day ahead",
    description: "Meetings, focus blocks, and breathing room.",
    icon: "◷",
    category: "Your day",
  },
  email: {
    name: "Inbox",
    title: "Worth a reply",
    description: "A considered selection from your inbox.",
    icon: "↗",
    category: "Your day",
  },
  tasks: {
    name: "Tasks",
    title: "On your list",
    description: "Deadlines and follow-ups, ready to check off.",
    icon: "☑",
    category: "Your day",
  },
  messages: {
    name: "Messages",
    title: "In conversation",
    description: "Selected chats from Beeper or an imported source.",
    icon: "↔",
    category: "Your day",
  },
  headlines: {
    name: "Headlines",
    title: "A wider perspective",
    description: "Your chosen reporting, topics, and interests.",
    icon: "▤",
    category: "Your world",
  },
  markets: {
    name: "Markets",
    title: "The market notebook",
    description: "A watchlist with attributed, timestamped data.",
    icon: "↗",
    category: "Your world",
  },
  weather: {
    name: "Weather",
    title: "Before you head out",
    description: "The forecast for the day outside.",
    icon: "☼",
    category: "Your world",
  },
  facts: {
    name: "Curiosity",
    title: "One interesting thing",
    description: "A small discovery to take into the day.",
    icon: "✳",
    category: "Your world",
  },
  notes: {
    name: "Notes",
    title: "Room to think",
    description: "Open space for the ideas that arrive on paper.",
    icon: "✎",
    category: "Your space",
  },
};
export const voices = {
  original: "Source voice",
  brief: "Concise briefing",
  editorial: "Editorial digest",
  action: "Action-oriented",
};
export const lengths = {
  inherit: "Use edition setting",
  headlines: "Headlines only",
  short: "Short summaries",
  full: "Full context",
};
export const sizes = {
  compact: "Compact",
  standard: "Standard",
  feature: "Feature",
};
export const sourceCatalog = [
  ...rssCatalog.map((p) => ({
    id: p.name,
    name: p.name,
    initial: "R",
    types: ["headlines"],
    detail: p.description,
    method: "RSS · no account needed",
    rssId: p.id,
  })),
  {
    id: "Gmail",
    name: "Gmail",
    initial: "G",
    types: ["email"],
    detail: "Read-only inbox selection",
    method: "Google credentials",
  },
  {
    id: "Google Calendar",
    name: "Google Calendar",
    initial: "31",
    types: ["schedule"],
    detail: "Meetings & recurring events",
    method: "Google credentials",
  },
  {
    id: "My tasks",
    name: "My tasks",
    initial: "✓",
    types: ["tasks", "priorities"],
    detail: "A list you write yourself",
    method: "Create a task list",
  },
  {
    id: "Beeper",
    name: "Beeper",
    initial: "b",
    types: ["messages"],
    detail: "Your selected conversations",
    method: "Local MCP guide & import",
  },
  {
    id: "Akiflow",
    name: "Akiflow",
    initial: "A",
    types: ["tasks", "schedule"],
    detail: "Tasks and time blocks",
    method: "Remote MCP guide & import",
  },
  {
    id: "Reading list",
    name: "Reading list",
    initial: "R",
    types: ["headlines", "facts"],
    detail: "Articles & ideas you choose",
    method: "Import a feed",
  },
  {
    id: "Open-Meteo",
    name: "Open-Meteo",
    initial: "☼",
    types: ["weather"],
    detail: "Daily weather forecast",
    method: "Set a location",
  },
  {
    id: "Watchlist",
    name: "Watchlist",
    initial: "↗",
    types: ["markets"],
    detail: "Your market data provider",
    method: "Import a feed",
  },
];
export function newModule(type, index = 0) {
  if (!Object.hasOwn(moduleTypes, type)) throw Error("Unknown module type");
  return {
    id: `${type}-${index}`,
    type,
    title: moduleTypes[type].title,
    enabled: true,
    sourceIds: null,
    voice: "inherit",
    length: "inherit",
    size: type === "priorities" ? "feature" : "standard",
    limit: type === "priorities" ? 3 : 6,
    focus: "",
    focusMode: "prioritize",
    layout: type === "tasks" ? "checklist" : "stories",
  };
}
export function validateModules(modules) {
  if (!Array.isArray(modules) || modules.length > 24)
    throw Error("Choose up to 24 modules");
  const ids = new Set();
  return modules.map((m) => {
    if (
      !m ||
      !Object.hasOwn(moduleTypes, m.type) ||
      typeof m.id !== "string" ||
      !/^[-a-zA-Z0-9]{1,80}$/.test(m.id) ||
      ids.has(m.id)
    )
      throw Error("Invalid or duplicate module ID");
    ids.add(m.id);
    if (
      typeof m.title !== "string" ||
      !m.title.trim() ||
      m.title.length > 80 ||
      typeof m.enabled !== "boolean"
    )
      throw Error("Invalid module title or visibility");
    if (
      m.sourceIds !== null &&
      (!Array.isArray(m.sourceIds) ||
        m.sourceIds.length > 20 ||
        m.sourceIds.some(
          (x) => typeof x !== "string" || !x.trim() || x.length > 80,
        ))
    )
      throw Error("Invalid module sources");
    if (
      !["inherit", ...Object.keys(voices)].includes(m.voice) ||
      !Object.hasOwn(lengths, m.length) ||
      !Object.hasOwn(sizes, m.size) ||
      !["stories", "list", "checklist"].includes(m.layout)
    )
      throw Error("Invalid module presentation");
    if (
      !Number.isInteger(m.limit) ||
      m.limit < 1 ||
      m.limit > 12 ||
      typeof m.focus !== "string" ||
      m.focus.length > 200 ||
      !["prioritize", "only"].includes(m.focusMode)
    )
      throw Error("Invalid module focus or length");
    return Object.fromEntries(
      Object.keys(newModule(m.type)).map((k) => [k, structuredClone(m[k])]),
    );
  });
}
export function focusTerms(text) {
  return text
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function focusMatches(item, text) {
  const haystack =
    `${item.title} ${item.detail} ${item.source} ${item.topic}`.toLowerCase();
  return focusTerms(text).filter((t) => haystack.includes(t)).length;
}
export function editorialText(item, module, config) {
  const voice = module.voice === "inherit" ? config.voice : module.voice;
  const length =
    module.length === "inherit" ? config.readingLength : module.length;
  let detail =
    item.kind === "email" && !config.emailSnippets ? "" : item.detail;
  if (length === "headlines") detail = "";
  else if (length === "short" || voice === "brief") {
    const sentence = detail.match(/^.*?[.!?](?:\s|$)/)?.[0] || detail;
    detail =
      sentence.length > 150 ? sentence.slice(0, 147).trimEnd() + "…" : sentence;
  }
  return { ...item, detail, voice };
}
export function presetModules(name) {
  const maps = {
    essential: ["priorities", "schedule", "email", "notes"],
    balanced: ["priorities", "schedule", "email", "weather", "facts", "notes"],
    weekend: ["headlines", "weather", "facts", "notes"],
  };
  if (!Object.hasOwn(maps, name)) throw Error("Unknown edition preset");
  return maps[name].map((type, i) => ({
    ...newModule(type, i),
    limit: type === "priorities" ? 3 : type === "email" ? 3 : 4,
  }));
}

// Source selection also controls provider requests, not just display filtering.
export function usesSource(config, type, source) {
  if (!config.modules) return config.sections.includes(type);
  return config.modules.some(
    (m) =>
      m.enabled &&
      m.type === type &&
      (m.sourceIds === null || m.sourceIds.includes(source)),
  );
}
