import {
  rssCatalog,
  connectionGuides,
  fontNames,
  editorialTemplates,
  printerProfiles,
} from "./catalog.mjs";
import {
  defaults,
  validateConfig,
  edition,
  sampleFeeds,
  escapeHTML as e,
  styles,
} from "./core.mjs";
import {
  moduleTypes,
  newModule,
  voices,
  lengths,
  sizes,
  sourceCatalog,
  presetModules,
} from "./modules.mjs";
import { renderDocument } from "./render.mjs";
import { saveConfigSnapshot } from "./editor-state.mjs";
import { createDemoApi } from "./demo.mjs";
const publicDemoApi =
  document.documentElement.dataset.mode === "public-demo"
    ? createDemoApi()
    : null;
const $ = (id) => document.getElementById(id);
let config = validateConfig(defaults),
  saved = "",
  state = { feeds: [] },
  tab = "sections",
  selected = null,
  library = false,
  sourceDetail = null,
  sourceFilter = "all",
  sourceDraft = null,
  sourceLoading = false,
  sourceError = "",
  sourceRequest = 0,
  currentEdition,
  sequence = 0,
  debounce,
  history = [],
  future = [];
const clone = (x) => structuredClone(x);
function toast(text, error = false) {
  $("toast").textContent = text;
  $("toast").className = "show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").className = ""), 5000);
}
async function api(path, options = {}) {
  if (publicDemoApi) return publicDemoApi(path, options);
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const b = await r.json();
  if (r.status === 401) {
    $("login").hidden = false;
    $("app").hidden = true;
  }
  if (!r.ok) throw Error(b.error || "Request failed");
  return b;
}
function historyState() {
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
  $("save-state").textContent =
    JSON.stringify(config) === saved ? "All changes saved" : "Unsaved changes";
}
function invalidateProof() {
  sequence++;
  currentEdition = null;
  $("print").disabled = true;
  $("preview-caption").textContent = "Updating proof…";
  $("preview-area")?.setAttribute("aria-busy", "true");
}
function change(fn, rerender = false, silent = false) {
  const before = clone(config);
  try {
    fn(config);
    config = validateConfig(config);
    history.push(before);
    if (history.length > 80) history.shift();
    future = [];
    historyState();
    if (rerender) renderPanel();
    invalidateProof();
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 150);
    return true;
  } catch (err) {
    config = before;
    if (!silent) toast(err.message, true);
    return false;
  }
}
function setTab(value) {
  const invalid = $("panel").querySelector('[aria-invalid="true"]');
  if (invalid) {
    invalid.reportValidity();
    toast("Correct the highlighted field before leaving this panel.", true);
    return false;
  }
  tab = value;
  selected = null;
  library = false;
  sourceDetail = null;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  });
  renderPanel();
  $("panel").scrollTop = 0;
  return true;
}
const options = (map, value) =>
  Object.entries(map)
    .map(
      ([key, label]) =>
        `<option value="${e(key)}" ${String(key) === String(value) ? "selected" : ""}>${e(label)}</option>`,
    )
    .join("");
function field(
  key,
  label,
  {
    scope = "config",
    map,
    type = "text",
    min,
    max,
    step,
    help = "",
    placeholder = "",
  } = {},
) {
  const obj =
    scope === "module" ? config.modules.find((m) => m.id === selected) : config;
  const value = obj[key];
  const attr = `data-${scope}="${key}" id="field-${scope}-${key}"`;
  return `<label class="field">${e(label)}${type === "range" ? ` <output id="output-${key}">${e(value)}${key === "fontScale" ? "%" : ""}</output>` : ""}${map ? `<select ${attr}>${options(map, value)}</select>` : `<input ${attr} type="${type}" value="${e(Array.isArray(value) ? value.join(", ") : value)}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""} ${step ? `step="${step}"` : ""} ${type === "text" ? `maxlength="${max || 200}"` : ""} placeholder="${e(placeholder)}">`}${help ? `<small>${e(help)}</small>` : ""}</label>`;
}
function check(key, label, help = "") {
  return `<label class="check-row"><span>${e(label)}${help ? `<small>${e(help)}</small>` : ""}</span><input type="checkbox" data-config="${key}" ${config[key] ? "checked" : ""}></label>`;
}
function catalog() {
  const all = sourceCatalog.map((x) => ({ ...x }));
  for (const f of state.feeds) {
    const existing = all.find((s) => s.id === f.name);
    if (existing)
      existing.types = [...new Set([...existing.types, ...(f.types || [])])];
    else
      all.push({
        id: f.name,
        name: f.name,
        initial: f.name[0],
        types: f.types || [],
        detail: `${f.count} imported items`,
        method: "Import a feed",
      });
  }
  return all;
}
function compatible(m) {
  return catalog().filter(
    (s) =>
      s.types.includes(m.type) ||
      (m.type === "priorities" && s.types.includes("tasks")),
  );
}
function sourceStatus(id) {
  const rss = rssCatalog.find((p) => p.name === id);
  if (rss)
    return config.rssSources.includes(rss.id)
      ? "Enabled RSS"
      : "No account needed";
  const feed = state.feeds.find((f) => f.name === id);
  if (feed)
    return Date.now() - Date.parse(feed.updatedAt) > 36 * 3600000
      ? "Needs fresh data"
      : "Imported";
  if (["Gmail", "Google Calendar"].includes(id) && state.googleConfigured)
    return "Configured";
  if (id === "Open-Meteo" && config.weatherLatitude && config.weatherLongitude)
    return "Location set";
  return "Setup needed";
}
function moduleSources(m) {
  if (m.type === "notes") return "Writing space";
  return m.sourceIds === null
    ? "All compatible sources"
    : m.sourceIds.length
      ? m.sourceIds.join(" + ")
      : "No sources selected";
}
function sectionPanel() {
  return `<div class="panel-top"><h2>Build your edition</h2><span class="count">${config.modules.filter((m) => m.enabled).length} sections</span></div><p class="hint">A paper with your priorities. Add, arrange, and make every section your own.</p><div class="presets" aria-label="Edition presets"><button data-preset="essential">The essentials</button><button data-preset="balanced">Balanced</button><button data-preset="weekend">Slow weekend</button></div><div class="outline">${config.modules.map((m, i) => `<article class="module-card ${m.enabled ? "" : "off"}" draggable="true" data-drag="${e(m.id)}"><span class="module-icon">${moduleTypes[m.type].icon}</span><button class="module-open" data-open="${e(m.id)}"><b>${e(m.title)}</b><small>${e(moduleTypes[m.type].name)} · ${e(sizes[m.size])} · ${m.limit} items</small></button><button class="icon-btn" data-open="${e(m.id)}" aria-label="Edit ${e(m.title)}">›</button><div class="module-controls"><span>${e(m.type === "notes" ? "Space for your ideas" : m.sourceIds === null ? "All sources" : m.sourceIds.length + " selected sources")}</span><div><button class="icon-btn" data-move="${e(m.id)}" data-direction="-1" ${i === 0 ? "disabled" : ""} aria-label="Move ${e(m.title)} up">↑</button><button class="icon-btn" data-move="${e(m.id)}" data-direction="1" ${i === config.modules.length - 1 ? "disabled" : ""} aria-label="Move ${e(m.title)} down">↓</button><button class="icon-btn" data-toggle="${e(m.id)}" aria-label="${m.enabled ? "Hide" : "Show"} ${e(m.title)}" aria-pressed="${m.enabled}">${m.enabled ? "●" : "○"}</button></div></div></article>`).join("") || '<div class="empty-state">A clean page.<br>Add your first section below.</div>'}</div><button class="add-section" data-action="library">＋ Add a section</button><p class="hint">Drag to reorder, or use the arrows. Select any section to fine-tune it.</p><div class="bottom-tools"><button class="quiet" data-action="export">Export template ↗</button><button class="quiet" data-action="import">Import template</button></div>`;
}
function libraryPanel() {
  return `<button class="back quiet" data-action="back">← Your sections</button><div class="panel-top"><h2>A place for everything.</h2></div><p class="hint">Add the same kind more than once—for work and personal, or a different focus.</p><div class="library">${Object.entries(
    moduleTypes,
  )
    .map(
      ([key, m]) =>
        `<button data-add="${key}"><span class="module-icon">${m.icon}</span><span><b>${e(m.name)}</b><small>${e(m.description)}</small></span><span>＋</span></button>`,
    )
    .join("")}</div>`;
}
function inspector() {
  const m = config.modules.find((x) => x.id === selected);
  if (!m) {
    selected = null;
    return sectionPanel();
  }
  return `<button class="back quiet" data-action="back">← Your sections</button><div class="panel-top"><h2>${e(moduleTypes[m.type].name)}</h2><span class="count">${config.modules.indexOf(m) + 1} / ${config.modules.length}</span></div><p class="hint">${e(moduleTypes[m.type].description)}</p>${field("title", "Section headline", { scope: "module", max: 80 })}<div class="field-row">${field("size", "Space on the page", { scope: "module", map: sizes })}${field("layout", "Presentation", { scope: "module", map: { stories: "Stories", list: "Compact list", checklist: "Checklist" } })}</div>${
    m.type === "notes"
      ? '<p class="notice">Compact, standard, and feature sizes give you different amounts of handwriting space.</p>'
      : `<hr class="section-rule"><h3>Choose the sources</h3><p class="hint">${$("demo").checked ? "Sample mode uses fictional items for each source. Live connections are shown below." : "Only items from the selected sources enter this section."}</p><label class="check-row"><span>All compatible sources<small>Automatically includes future sources.</small></span><input id="all-sources" type="checkbox" ${m.sourceIds === null ? "checked" : ""}></label><div class="source-options">${
          compatible(m)
            .map(
              (s) =>
                `<label class="source-option"><input type="checkbox" data-source-choice="${e(s.id)}" ${m.sourceIds === null || m.sourceIds.includes(s.id) ? "checked" : ""}><span>${e(s.name)}<small>${e(sourceStatus(s.id))}</small></span><span class="source-letter">${e(s.initial)}</span></label>`,
            )
            .join("") ||
          '<p class="hint">Import a compatible source in the Sources panel.</p>'
        }${(m.sourceIds || [])
          .filter((id) => !compatible(m).some((s) => s.id === id))
          .map(
            (id) =>
              `<label class="source-option"><input type="checkbox" data-source-choice="${e(id)}" checked><span>${e(id)}<small>Source not connected</small></span></label>`,
          )
          .join(
            "",
          )}</div><button class="quiet" data-action="sources" style="margin-top:9px">Manage sources →</button><hr class="section-rule"><h3>Give it an editorial direction</h3>${field("voice", "Writing treatment", { scope: "module", map: { inherit: "Use edition setting", ...voices } })}${field("length", "Reading depth", { scope: "module", map: lengths })}<p class="hint">Source voice keeps the original text. Concise shortens it. Editorial adds a digest introduction. Action-oriented adds review / to-do cues. No invented rewrites.</p>${field("focus", "Focus on", { scope: "module", placeholder: "e.g. research, family, decisions", help: "Comma-separated words or phrases found in the source text." })}${field("focusMode", "How to use this focus", { scope: "module", map: { prioritize: "Bring matching items to the top", only: "Only include matching items" } })}${field("limit", "Maximum items", { scope: "module", type: "range", min: 1, max: 12, step: 1 })}`
  }<hr class="section-rule"><div class="bottom-tools"><button class="secondary" data-duplicate="${e(m.id)}">Duplicate section</button><button class="quiet danger" data-delete="${e(m.id)}">Remove</button></div>`;
}
function stylePanel() {
  return `<div class="panel-top"><h2>Make it yours.</h2></div><p class="hint">Set the character of your paper. Individual sections can have their own direction.</p>${field("name", "Newspaper name", { max: 64 })}<div class="field-row">${field("owner", "Prepared for", { max: 40 })}${field("city", "Edition / city", { max: 60 })}</div>${field("tagline", "Under the masthead", { max: 120 })}<hr class="section-rule"><h3>A newspaper tradition</h3>${Object.entries(
    styles,
  )
    .map(
      ([id, name]) =>
        `<button data-style="${id}" class="style-card ${config.style === id ? "active" : ""}" aria-pressed="${config.style === id}"><span class="type-sample" style="${id === "journal" ? "text-transform:uppercase;font-size:18px" : id === "coast" ? "font-style:italic" : ""}">The Daily</span><small>${e(name)}</small></button>`,
    )
    .join(
      "",
    )}${field("font", "Reading font", { map: fontNames })}${field("headingFont", "Headline font", { map: { inherit: "Match reading font", ...fontNames } })}${field("mastheadScale", "Masthead size", { type: "range", min: 75, max: 130, step: 5 })}${field("lineHeight", "Line spacing", { type: "range", min: 120, max: 180, step: 5 })}${field("ruleStyle", "Divider rules", { map: { classic: "Classic double rules", light: "Light rules", heavy: "Bold rules" } })}<p class="hint">Fonts use local system stacks with fallbacks. No remote font service is contacted.</p><div class="field-row">${field("color", "Ink", { map: { mono: "Black & white", color: "Color accents" } })}${field("paper", "Paper size", { map: { Letter: "US Letter", A4: "A4" } })}</div>${config.printerProfile === "brother-hl-l2460dw" ? '<p class="hint">Your Brother HL-L2460DW prints black-and-white. Choose a different printer profile in Delivery to enable color.</p>' : ""}<h3>Accent color</h3><div class="swatches">${Object.entries(
    {
      forest: "#38594b",
      oxblood: "#833d3c",
      navy: "#334f73",
      sepia: "#8a613c",
    },
  )
    .map(
      ([id, color]) =>
        `<button class="swatch ${config.accent === id ? "active" : ""}" style="--swatch:${color}" data-accent="${id}" aria-label="${id} accent" aria-pressed="${config.accent === id}" title="${id}"></button>`,
    )
    .join(
      "",
    )}</div><hr class="section-rule"><h3>Size & rhythm</h3><div class="field-row">${field("columns", "Columns", { map: { 1: "One", 2: "Two", 3: "Three" } })}${field("density", "Spacing", { map: { compact: "Compact", balanced: "Balanced", airy: "Airy" } })}</div>${field("fontScale", "Reading text size", { type: "range", min: 85, max: 130, step: 5 })}${check("showSources", "Show source credits", "News, weather, and market attribution stays visible.")}<hr class="section-rule"><h3>Writing templates</h3><div class="editorial-templates">${Object.entries(
    editorialTemplates,
  )
    .map(
      ([id, t]) =>
        `<button data-editorial-template="${id}"><b>${e(t.name)}</b><small>${e(t.description)}</small></button>`,
    )
    .join(
      "",
    )}</div><p class="hint">Templates change depth, structure, and item count. They use source text; AI rewriting is not connected.</p><h3>Your editorial defaults</h3>${field("voice", "Writing treatment", { map: voices })}${field("readingLength", "Reading depth", { map: { headlines: "Headlines only", short: "Short summaries", full: "Full context" } })}${field("focus", "Edition-wide focus", { placeholder: "e.g. decisions, health, research", help: "Matching items are prioritized across sections." })}${field("topics", "Allowed news topics", { help: "Comma-separated. Leave blank to include all topics." })}${check("emailSnippets", "Include email excerpts", "Off: print subjects and senders only.")}<p class="hint">Original layouts inspired by newspaper traditions. No publisher branding or proprietary fonts.</p>`;
}
function weatherFields() {
  return `<p class="setup-copy">Use city-center coordinates. Live weather sends this location to Open-Meteo. Sample mode makes no provider request.</p><div class="field-row">${field("weatherLatitude", "Latitude", { placeholder: "29.76" })}${field("weatherLongitude", "Longitude", { placeholder: "-95.37" })}</div>${field("weatherUnits", "Temperature", { map: { fahrenheit: "Fahrenheit", celsius: "Celsius" } })}${field("weatherPlan", "Weather service", { map: { personal: "Personal / non-commercial", commercial: "Commercial subscription" } })}<p class="hint">Commercial editions require your Open-Meteo subscription key on the server.</p>`;
}
function sourcePanel() {
  if (sourceDetail)
    return sourceDetail === "__installation"
      ? installationPanel()
      : sourceSetup(sourceDetail);
  const entries = catalog().filter(
    (s) =>
      sourceFilter === "all" ||
      (sourceFilter === "rss"
        ? s.rssId
        : sourceFilter === "mcp"
          ? connectionGuides[s.id]
          : state.feeds.some((f) => f.name === s.id)),
  );
  return `<div class="panel-top"><h2>Your source desk.</h2><span class="count">${config.rssSources.length + state.feeds.length} selected</span></div><p class="hint">Bring your day and the wider world into one paper. Each source has its own setup guide and section choices.</p><div class="source-filters">${Object.entries(
    { all: "All", mcp: "MCP apps", rss: "News feeds", imports: "My imports" },
  )
    .map(
      ([id, label]) =>
        `<button data-source-filter="${id}" class="${sourceFilter === id ? "active" : ""}">${label}</button>`,
    )
    .join(
      "",
    )}</div><label class="field source-search">Find a source<input id="source-search" type="search" placeholder="Search sources…"></label><div id="source-catalog">${entries.map((s) => `<article class="source-card" data-source-name="${e(s.name.toLowerCase())}"><span class="source-letter">${e(s.initial)}</span><div><b>${e(s.name)}</b><p>${e(s.detail)}</p><span class="badge">${e(sourceStatus(s.id))}</span>${connectionGuides[s.id] ? `<small class="source-method">${connectionGuides[s.id].local ? "MCP on your computer" : "MCP with browser sign-in"}</small>` : ""}</div><button data-setup="${e(s.id)}">${s.rssId ? "Choose" : connectionGuides[s.id] ? "MCP guide" : state.feeds.some((f) => f.name === s.id) ? "Edit" : "Set up"} ›</button></article>`).join("") || '<p class="empty-state">No imported sources yet. Add your own task list or a reviewed export.</p>'}</div><button class="add-section" data-setup="Custom feed">＋ Add another source</button><button class="quiet setup-link" data-action="installation">Install on your Cloudflare →</button>`;
}
function sourcePlacement(id) {
  const matches = config.modules.filter(
    (m) => m.enabled && compatible(m).some((s) => s.id === id),
  );
  return `<hr class="section-rule"><h3>Where this source appears</h3>${matches.map((m) => `<label class="check-row"><span>${e(m.title)}<small>${e(moduleTypes[m.type].name)}</small></span><input type="checkbox" data-placement="${e(m.id)}" data-provider="${e(id)}" ${m.sourceIds === null || m.sourceIds.includes(id) ? "checked" : ""}></label>`).join("") || '<p class="hint">Add a compatible section from Sections to use this source.</p>'}`;
}
function connectionGuide(id) {
  const g = connectionGuides[id];
  return `<div class="connection-status"><b>${e(g.label)}</b><p>${e(g.status)}</p></div><ol class="setup-steps">${g.steps.map((step) => `<li>${e(step)}</li>`).join("")}</ol><label class="field">Official MCP server<input readonly value="${e(g.url)}"></label><div class="field-row"><button class="secondary" data-copy-mcp="${e(id)}">Copy address</button><a class="button-link" href="${e(g.docs)}" target="_blank" rel="noopener noreferrer">Official guide ↗</a></div><p class="hint">Use OAuth in your MCP client. Do not paste an account token into this page.</p><button class="quiet" data-export-prompt="${e(id)}">Copy a read-only export prompt</button>`;
}
async function openSource(id) {
  const request = ++sourceRequest;
  sourceDetail = id;
  sourceError = "";
  sourceDraft = null;
  sourceLoading = state.feeds.some((f) => f.name === id);
  renderPanel();
  $("panel").scrollTop = 0;
  if (state.feeds.some((f) => f.name === id)) {
    try {
      const draft = await api("/feeds?name=" + encodeURIComponent(id));
      if (sourceDetail === id && request === sourceRequest) {
        sourceDraft = draft;
        sourceLoading = false;
        renderPanel();
      }
    } catch (err) {
      if (sourceDetail === id && request === sourceRequest) {
        sourceError =
          "Could not load this source. Go back and reopen it to retry.";
        renderPanel();
      }
      toast(err.message, true);
    }
  }
}
function sourceSetup(id) {
  const s = catalog().find((s) => s.id === id);
  const feed = state.feeds.find((f) => f.name === id);
  let body = "";
  const rss = rssCatalog.find((p) => p.name === id);
  if (rss)
    return `<button class="back quiet" data-action="source-back">← All sources</button><h2>${e(rss.name)}</h2><p class="hint">RSS · no sign-in or AI key needed</p><p class="setup-copy">${e(rss.description)} Your Worker retrieves the latest feed when preparing your paper. Headlines retain publisher links and dates; full articles are not scraped.</p><div class="notice">${config.rssSources.includes(rss.id) ? "Selected for this edition. Save your edition to include it in scheduled runs." : "Available to add. No account connection required."}</div><button class="primary" data-rss-toggle="${rss.id}">${config.rssSources.includes(rss.id) ? "Remove from edition" : "Add to my edition"}</button><p class="hint">Sample mode stays fictional. Switch off Sample data to fetch public headlines. Only articles published within the last seven days are included when dates are supplied.</p><a class="setup-link" href="${e(rss.guide)}" target="_blank" rel="noopener noreferrer">Publisher’s feed guide ↗</a><p class="hint">${e(rss.terms)}</p>${sourcePlacement(id)}`;
  if (id === "Open-Meteo") body = weatherFields();
  else if (["Gmail", "Google Calendar"].includes(id))
    body = `<div class="notice">${state.googleConfigured ? "Google credentials are configured. The connection is checked when you preview live data." : "Google is not connected yet."}</div><p class="setup-copy">The read-only Google adapter is built. Set up your own Google OAuth app and grant Gmail read-only and Calendar read-only access, then configure the three Google credentials on your Cloudflare Worker.</p><p class="setup-copy">Follow <code>docs/connectors.md</code> in the project for setup. Tokens stay on the server. A self-service OAuth sign-in screen is not included yet.</p><p class="hint">${id === "Gmail" ? "Superhuman uses this same underlying Gmail inbox." : ""}</p>`;
  else {
    body =
      (connectionGuides[id] ? connectionGuide(id) : "") +
      (id === "My tasks"
        ? `<h3>Start with your own list</h3><p class="hint">One task per line. Order sets priority. Saving replaces the “My tasks” source; keep a copy of anything you want to retain.</p><label class="field">Today’s tasks<textarea id="manual-tasks" rows="7" placeholder="Finish the research brief&#10;Review the proposal&#10;Plan a proper lunch break">${e(
            sourceDraft?.items
              .filter((i) => i.kind === "tasks")
              .map((i) => i.title)
              .join("\n") || "",
          )}</textarea></label><button class="primary" data-action="save-tasks">Save task list</button><hr class="section-rule">`
        : id === "Beeper"
          ? '<p class="setup-copy">Run the local Beeper exporter with an explicit chat allowlist. It only reads selected conversations. Review the output, then import it here.</p>'
          : id === "Akiflow"
            ? '<p class="setup-copy">After connecting your MCP assistant, use the export prompt above and import its reviewed output here. Direct scheduled MCP ingestion remains an implementation step.</p>'
            : '<p class="setup-copy">Import a feed from your chosen tool, or send updates to the authenticated feed API after deployment. Imported snapshots expire from editions after 36 hours.</p>') +
      `<label class="field">Source name<input id="feed-name" maxlength="40" value="${e(id)}"></label><label class="field">Feed JSON<textarea id="feed-json" spellcheck="false" rows="8" placeholder='{"items":[{"kind":"tasks","title":"Your task"}]}'>${e(sourceDraft ? JSON.stringify({ items: sourceDraft.items }, null, 2) : "")}</textarea><small>Supported kinds: tasks, schedule, email, messages, headlines, markets, weather, facts, priorities.</small></label><div class="field-row"><button class="secondary" data-action="feed-file">Choose JSON file</button><button class="primary" data-action="save-feed">Import source</button></div>`;
  }
  return `<button class="back quiet" data-action="source-back">← All sources</button><div class="panel-top"><h2>${e(s?.name || id)}</h2><span class="source-letter">${e(s?.initial || "+")}</span></div><p class="hint">${e(s?.method || "Common feed adapter")}</p>${sourceLoading ? `<p class="notice" role="status">${e(sourceError || "Loading your saved source…")}</p>` : ""}${body}${sourcePlacement(id)}${feed ? `<div class="notice">${feed.count} items imported · ${e(new Date(feed.updatedAt).toLocaleString())}<br><button class="quiet danger" data-remove-feed="${e(id)}">Remove imported source</button></div>` : ""}`;
}
function deliveryPanel() {
  return `<div class="panel-top"><h2>Ready when you are.</h2></div><p class="hint">An edition for the start of your day, in the timezone you choose.</p>${field("time", "Prepare my paper at", { type: "time" })}${field("timezone", "Timezone", { placeholder: "America/Chicago" })}${check("enabled", "Daily preparation", "Generate within five minutes of your chosen time.")}<div class="notice">${state.localDemo ? "Local preview: automatic delivery and the print queue are disabled." : "Daily preparation runs on Cloudflare. Your printer bridge must be awake to collect the edition."}</div><hr class="section-rule"><h3>Your printer</h3>${field("printerProfile", "Printer profile", { map: printerProfiles })}${field("duplex", "Print sides", { map: { "one-sided": "Single-sided", "two-sided-long-edge": "Double-sided · turn like a book", "two-sided-short-edge": "Double-sided · flip upward" } })}<div class="notice">${config.printerProfile === "brother-hl-l2460dw" ? "Brother HL-L2460DW · black-and-white laser · automatic duplex. Color output is disabled for this profile." : "Choose your installed printer profile. Actual capabilities depend on the printer and driver."}</div><ol class="setup-steps"><li>Join the printer to your Wi-Fi or Ethernet network.</li><li>On your Mac, open System Settings → Printers & Scanners. Add the Brother using AirPrint.</li><li>Print a two-page PDF from macOS and confirm page orientation before enabling automatic delivery.</li><li>Configure the existing print bridge on this computer. It must be awake at delivery time.</li></ol><a class="setup-link" href="https://support.brother.com/g/s/id/htmldoc/printer/cv_hll2460dw/use/html/GUID-D8D10688-FA26-4D0F-9690-718F1E1590F7_1.html" target="_blank" rel="noopener noreferrer">Brother AirPrint instructions ↗</a><h3>From the cloud to your printer</h3><p class="setup-copy">The local bridge on your Mac or Linux computer retrieves the paper and prints through your installed printer queue. Configure it with the setup guide in this project.</p><p class="hint">The HL-L2460DW profile is implemented. Physical printing and printer wake-up still need a hardware test.</p><button class="secondary" id="queue" ${state.localDemo ? "disabled" : ""}>Prepare today’s print job</button><button class="quiet setup-link" data-action="installation">Cloudflare installation options →</button><h3>Recent editions</h3><div id="jobs" class="hint">Loading…</div>`;
}
function installationPanel() {
  return `<button class="back quiet" data-action="source-back">← All sources</button><h2>Your own Cloudflare.</h2><p class="hint">Customers should not need a GitHub account.</p><div class="connection-status"><b>Current kit: download and deploy</b><p>The source ZIP can be installed using Node and Wrangler. GitHub is optional. Follow the included README for the deployment and printer setup commands.</p></div><h3>The simpler installation we can build</h3><ol class="setup-steps"><li>Choose “Install my newspaper.”</li><li>Sign in to Cloudflare and approve the requested account permissions.</li><li>The installer uploads a tested release and creates the newspaper’s storage and schedule.</li><li>Connect your sources and pair the printer companion.</li></ol><p class="hint">Cloudflare supports third-party OAuth clients for this flow. The installer application and its OAuth registration are not implemented in this kit yet.</p><a class="setup-link" href="https://developers.cloudflare.com/fundamentals/oauth/" target="_blank" rel="noopener noreferrer">Cloudflare OAuth documentation ↗</a><h3>Try first, claim later</h3><p class="setup-copy">Cloudflare also documents temporary deployments that a customer can claim. The claim must finish within 60 minutes. Use this for a sample-only trial; connect private sources after ownership is established.</p><a class="setup-link" href="https://developers.cloudflare.com/workers/platform/claim-deployments/" target="_blank" rel="noopener noreferrer">Claim-deployment documentation ↗</a><hr class="section-rule"><h3>Optional AI editor</h3><p class="setup-copy">Workers AI can run through a binding on the customer’s Worker without a separate AI-provider key. It would summarize retrieved sources; it does not replace account connections or fetch news by itself. AI editing and cost controls are not wired up yet.</p>`;
}
function renderPanel() {
  $("panel").innerHTML =
    tab === "sections"
      ? library
        ? libraryPanel()
        : selected
          ? inspector()
          : sectionPanel()
      : tab === "style"
        ? stylePanel()
        : tab === "sources"
          ? sourcePanel()
          : deliveryPanel();
  bindPanel();
  if (tab === "delivery") loadJobs();
}
function bindPanel() {
  if (sourceLoading && sourceDetail) {
    $("panel")
      .querySelectorAll(
        '#feed-json, #manual-tasks, #feed-name, [data-action="save-feed"], [data-action="save-tasks"], [data-action="feed-file"]',
      )
      .forEach((el) => (el.disabled = true));
  }
  const ink = $("field-config-color");
  if (ink && config.printerProfile === "brother-hl-l2460dw") {
    ink.disabled = true;
    ink.title =
      "Brother HL-L2460DW is monochrome. Change the printer profile in Delivery for a color printer.";
  }
  $("panel")
    .querySelectorAll("[data-placement]")
    .forEach(
      (el) =>
        (el.onchange = () =>
          change((c) => {
            const m = c.modules.find((m) => m.id === el.dataset.placement),
              id = el.dataset.provider;
            if (m.sourceIds === null)
              m.sourceIds = compatible(m).map((s) => s.id);
            m.sourceIds = el.checked
              ? [...new Set([...m.sourceIds, id])]
              : m.sourceIds.filter((s) => s !== id);
          }, true)),
    );
  $("panel")
    .querySelectorAll("[data-config],[data-module]")
    .forEach((el) =>
      el.addEventListener("input", () => {
        const scope = el.dataset.module ? "module" : "config",
          key = el.dataset[scope];
        let value = el.type === "checkbox" ? el.checked : el.value;
        if (
          [
            "columns",
            "fontScale",
            "limit",
            "mastheadScale",
            "lineHeight",
          ].includes(key)
        )
          value = Number(value);
        if (key === "topics")
          value = value
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        const valid = change(
          (c) => {
            const obj =
              scope === "module" ? c.modules.find((m) => m.id === selected) : c;
            obj[key] = value;
          },
          false,
          true,
        );
        el.setCustomValidity(valid ? "" : "Please enter a valid value.");
        el.setAttribute("aria-invalid", String(!valid));
        const out = $("output-" + key);
        if (out) out.textContent = value + (key === "fontScale" ? "%" : "");
        if (key === "printerProfile" && valid) renderPanel();
      }),
    );
  $("panel")
    .querySelectorAll("input[type=range]")
    .forEach((el) =>
      el.addEventListener("input", () => {
        const key = el.dataset.module || el.dataset.config;
        const out = $("output-" + key);
        if (out) out.textContent = el.value + (key === "fontScale" ? "%" : "");
      }),
    );
  $("panel")
    .querySelectorAll("[data-source-choice]")
    .forEach(
      (el) =>
        (el.onchange = () =>
          change((c) => {
            const m = c.modules.find((m) => m.id === selected);
            if (m.sourceIds === null)
              m.sourceIds = compatible(m).map((s) => s.id);
            m.sourceIds = el.checked
              ? [...new Set([...m.sourceIds, el.dataset.sourceChoice])]
              : m.sourceIds.filter((id) => id !== el.dataset.sourceChoice);
          }, true)),
    );
  if ($("all-sources"))
    $("all-sources").onchange = (ev) =>
      change(
        (c) =>
          (c.modules.find((m) => m.id === selected).sourceIds = ev.target
            .checked
            ? null
            : []),
        true,
      );
  if ($("source-search"))
    $("source-search").oninput = (ev) =>
      $("source-catalog")
        .querySelectorAll("[data-source-name]")
        .forEach(
          (row) =>
            (row.hidden = !row.dataset.sourceName.includes(
              ev.target.value.toLowerCase(),
            )),
        );
  $("panel")
    .querySelectorAll("[data-drag]")
    .forEach((row) => {
      row.ondragstart = (ev) => {
        ev.dataTransfer.setData("text/plain", row.dataset.drag);
        ev.dataTransfer.effectAllowed = "move";
      };
      row.ondragover = (ev) => {
        ev.preventDefault();
        row.classList.add("drag-over");
      };
      row.ondragleave = () => row.classList.remove("drag-over");
      row.ondrop = (ev) => {
        ev.preventDefault();
        const from = ev.dataTransfer.getData("text/plain");
        const target = row.dataset.drag;
        row.classList.remove("drag-over");
        if (from === target) return;
        change((c) => {
          const a = c.modules.findIndex((m) => m.id === from),
            b = c.modules.findIndex((m) => m.id === target);
          if (a < 0 || b < 0) return;
          const [m] = c.modules.splice(a, 1);
          c.modules.splice(b, 0, m);
        }, true);
      };
    });
  if ($("queue"))
    $("queue").onclick = async () => {
      try {
        if ($("demo").checked)
          throw Error("Switch off Sample data and review your sources first.");
        await save();
        await api("/generate", { method: "POST", body: "{}" });
        loadJobs();
        toast("Today’s edition is ready for the printer bridge.");
      } catch (err) {
        toast(err.message, true);
      }
    };
}
$("panel").addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.sourceFilter) {
      sourceFilter = b.dataset.sourceFilter;
      renderPanel();
    } else if (b.dataset.rssToggle) {
      const p = rssCatalog.find((p) => p.id === b.dataset.rssToggle);
      change((c) => {
        if (c.rssSources.includes(p.id))
          c.rssSources = c.rssSources.filter((id) => id !== p.id);
        else {
          c.rssSources.push(p.id);
          if (c.topics.length && !c.topics.includes(p.topic))
            c.topics.push(p.topic);
          let m = c.modules.find((m) => m.type === "headlines" && m.enabled);
          if (!m) {
            m = {
              ...newModule("headlines", crypto.randomUUID()),
              sourceIds: [p.name],
            };
            c.modules.push(m);
          }
          if (m.sourceIds !== null && !m.sourceIds.includes(p.name))
            m.sourceIds.push(p.name);
        }
      }, true);
    } else if (b.dataset.copyMcp) {
      await navigator.clipboard.writeText(
        connectionGuides[b.dataset.copyMcp].url,
      );
      toast(
        "MCP address copied. Add it in your assistant’s connectors settings.",
      );
    } else if (b.dataset.exportPrompt) {
      const id = b.dataset.exportPrompt;
      await navigator.clipboard.writeText(
        `Read only the ${id === "Beeper" ? "Beeper chats" : "Akiflow projects and schedule"} I explicitly choose. Do not send messages, create or modify tasks, or upload data. Export a JSON file with {"items":[]} using kind ${id === "Beeper" ? "messages" : "tasks or schedule"}, stable id, title, detail, source, URL, and priority (1 highest to 3). Schedule items need start/end timestamps; tasks may include due YYYY-MM-DD and done. At most 150 items. Use updatedAt with the actual retrieval time. Let me review the file before I import it into Morning Edition.`,
      );
      toast("Read-only export prompt copied.");
    } else if (b.dataset.editorialTemplate) {
      const t = editorialTemplates[b.dataset.editorialTemplate];
      change((c) => {
        c.voice = t.voice;
        c.readingLength = t.readingLength;
        c.density = t.density;
        c.modules.forEach((m) => {
          m.voice = "inherit";
          m.length = "inherit";
          m.limit = t.limit;
        });
      }, true);
      toast(
        "Template applied across sections. Undo restores your earlier settings.",
      );
    } else if (b.dataset.action === "installation") {
      setTab("sources");
      sourceDetail = "__installation";
      renderPanel();
    } else if (b.dataset.open) {
      selected = b.dataset.open;
      library = false;
      renderPanel();
      $("panel").scrollTop = 0;
    } else if (b.dataset.move)
      change((c) => {
        const i = c.modules.findIndex((m) => m.id === b.dataset.move),
          to = i + Number(b.dataset.direction);
        if (to >= 0 && to < c.modules.length)
          [c.modules[i], c.modules[to]] = [c.modules[to], c.modules[i]];
      }, true);
    else if (b.dataset.toggle)
      change((c) => {
        const m = c.modules.find((m) => m.id === b.dataset.toggle);
        m.enabled = !m.enabled;
      }, true);
    else if (b.dataset.preset) {
      change((c) => (c.modules = presetModules(b.dataset.preset)), true);
      toast("Preset applied. Undo restores your previous layout.");
    } else if (b.dataset.add) {
      change((c) => {
        const m = newModule(b.dataset.add, crypto.randomUUID());
        c.modules.push(m);
        selected = m.id;
        library = false;
      }, true);
      $("panel").scrollTop = 0;
    } else if (b.dataset.duplicate) {
      change((c) => {
        const i = c.modules.findIndex((m) => m.id === b.dataset.duplicate),
          m = clone(c.modules[i]);
        m.id = m.type + "-" + crypto.randomUUID();
        m.title = (m.title + " · copy").slice(0, 80);
        c.modules.splice(i + 1, 0, m);
        selected = m.id;
      }, true);
      toast("Section duplicated. Give it a different source or focus.");
    } else if (b.dataset.delete) {
      change((c) => {
        c.modules = c.modules.filter((m) => m.id !== b.dataset.delete);
        selected = null;
      }, true);
      toast("Section removed. Undo is available.");
    } else if (b.dataset.style)
      change((c) => (c.style = b.dataset.style), true);
    else if (b.dataset.accent)
      change((c) => {
        c.accent = b.dataset.accent;
        c.color = "color";
      }, true);
    else if (b.dataset.setup) {
      await openSource(b.dataset.setup);
    } else if (b.dataset.removeFeed) {
      await api("/feeds", {
        method: "DELETE",
        body: JSON.stringify({ name: b.dataset.removeFeed }),
      });
      state = await api("/config");
      renderPanel();
      refresh();
      toast("Imported source removed.");
    } else if (b.dataset.action === "back") {
      selected = null;
      library = false;
      renderPanel();
    } else if (b.dataset.action === "library") {
      library = true;
      selected = null;
      renderPanel();
      $("panel").scrollTop = 0;
    } else if (b.dataset.action === "sources") setTab("sources");
    else if (b.dataset.action === "source-back") {
      sourceDetail = null;
      renderPanel();
    } else if (b.dataset.action === "export") {
      download("morning-edition-template.json", { version: 1, config });
      toast("Template exported. It contains settings, not your source data.");
    } else if (b.dataset.action === "import") $("config-file").click();
    else if (b.dataset.action === "feed-file") $("feed-file").click();
    else if (b.dataset.action === "save-feed") {
      const data = JSON.parse($("feed-json").value);
      await importFeed($("feed-name").value, data);
    } else if (b.dataset.action === "save-tasks") {
      const titles = $("manual-tasks")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!titles.length) throw Error("Add at least one task.");
      const previous = [...(sourceDraft?.items || [])];
      await importFeed("My tasks", {
        items: titles.map((title, i) => {
          const index = previous.findIndex(
            (x) => x.kind === "tasks" && x.title === title,
          );
          const prior = index < 0 ? {} : previous.splice(index, 1)[0];
          return {
            ...prior,
            id: prior.id || crypto.randomUUID(),
            kind: "tasks",
            title,
            priority: Math.min(i + 1, 3),
            source: "My tasks",
          };
        }),
      });
    }
  } catch (err) {
    toast(err.message, true);
  }
});
function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("config-file").onchange = async (ev) => {
  try {
    const f = ev.target.files[0];
    if (!f) return;
    if (f.size > 200000) throw Error("Template is too large.");
    const data = JSON.parse(await f.text());
    if (data.version !== 1 || !data.config)
      throw Error("Choose a Morning Edition template (version 1).");
    const validated = validateConfig(data.config);
    change((c) => Object.assign(c, validated), true);
    toast("Template imported. Review it, then save your edition.");
  } catch (err) {
    toast(err.message, true);
  }
  ev.target.value = "";
};
$("feed-file").onchange = async (ev) => {
  try {
    const f = ev.target.files[0];
    if (!f) return;
    if (f.size > 200000) throw Error("Feed is too large.");
    if ($("feed-json")) $("feed-json").value = await f.text();
    toast("File loaded. Review it before importing.");
  } catch (err) {
    toast(err.message, true);
  }
  ev.target.value = "";
};
async function importFeed(name, data) {
  await api("/feeds", {
    method: "POST",
    body: JSON.stringify({ ...data, name }),
  });
  state = await api("/config");
  $("demo").checked = false;
  await openSource(name);
  await refresh();
  toast("Source imported. Preview now uses your own data.");
}
async function loadJobs() {
  try {
    const jobs = await api("/jobs");
    if (!$("jobs")) return;
    $("jobs").innerHTML = jobs.length
      ? jobs
          .map(
            (j) =>
              `<p>${e(j.id)} · ${e(j.status)}${j.status !== "pending" ? ` <button class="quiet" data-retry="${e(j.id)}">Reprint</button>` : ""}</p>`,
          )
          .join("")
      : "No editions in the print queue.";
    document.querySelectorAll("[data-retry]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            !confirm(
              "This can produce another physical copy. Check the printer queue first. Reprint this edition?",
            )
          )
            return;
          try {
            await api("/jobs/retry", {
              method: "POST",
              body: JSON.stringify({ id: b.dataset.retry, confirm: true }),
            });
            loadJobs();
          } catch (err) {
            toast(err.message, true);
          }
        }),
    );
  } catch (err) {
    toast(err.message, true);
  }
}
function resizePaper() {
  const f = $("preview"),
    stage = $("paper-stage");
  if (!stage.clientWidth) return;
  const width = config.paper === "A4" ? 794 : 816;
  const scale = Math.min(1, stage.clientWidth / width);
  f.style.width = width + "px";
  f.style.transform = `scale(${scale})`;
  const h = f.contentDocument?.body?.scrollHeight || 1056;
  f.style.height = h + "px";
  $("paper-wrap").style.height = h * scale + "px";
  $("paper-wrap").style.width = width * scale + "px";
  $("zoom-label").textContent = Math.round(scale * 100) + "% · fit to width";
}
$("preview").addEventListener("load", () => {
  const f = $("preview");
  f.style.height = "1px";
  resizePaper();
});
new ResizeObserver(resizePaper).observe($("paper-stage"));
async function refresh() {
  invalidateProof();
  const request = ++sequence;
  try {
    const c = validateConfig(config);
    const ed = $("demo").checked
      ? edition(c, sampleFeeds(new Date(), c), new Date(), true)
      : await api("/preview", {
          method: "POST",
          body: JSON.stringify({ config: c, demo: false }),
        });
    if (request !== sequence) return;
    currentEdition = ed;
    $("print").disabled = false;
    $("preview-area")?.setAttribute("aria-busy", "false");
    $("preview").srcdoc = renderDocument(ed);
    $("proof-title").textContent = c.name;
    const words = ed.modules
      .flatMap((m) => m.items)
      .reduce((n, i) => n + (i.title + " " + i.detail).split(/\s+/).length, 0);
    $("proof-stats").innerHTML =
      `<span><b>${ed.modules.length}</b> sections</span><span><b>${Math.max(1, Math.ceil(words / 200))} min</b> read</span><span><b>${c.paper}</b> · ${c.columns} columns</span><span>${c.color === "mono" ? "Black & white" : "Color edition"}</span>`;
    $("preview-caption").textContent = ed.demo
      ? "Sample edition · fictional content"
      : "Your sources · " + new Date(ed.generatedAt).toLocaleTimeString();
    $("source-warning").hidden = !ed.warnings.length;
    $("source-warning").textContent = ed.warnings.join(" ");
  } catch (err) {
    if (request === sequence) {
      $("preview-caption").textContent =
        "Proof unavailable · retry by switching Sample data";
      $("preview-area")?.setAttribute("aria-busy", "false");
      toast(err.message, true);
    }
  }
}
$("demo").onchange = () => {
  refresh();
  if (selected) renderPanel();
};
async function save() {
  const invalid = $("panel").querySelector('[aria-invalid="true"]');
  if (invalid) {
    invalid.reportValidity();
    throw Error("Correct the highlighted field before saving.");
  }
  saved = await saveConfigSnapshot(config, (body) =>
    api("/config", { method: "PUT", body }),
  );
  historyState();
}
$("save").onclick = async () => {
  try {
    $("save").disabled = true;
    await save();
    toast(
      JSON.stringify(config) === saved
        ? "Your edition is saved."
        : "Snapshot saved. Your newer edits are still unsaved.",
    );
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("save").disabled = false;
  }
};
$("undo").onclick = () => {
  if (!history.length) return;
  future.push(clone(config));
  config = history.pop();
  historyState();
  renderPanel();
  refresh();
};
$("redo").onclick = () => {
  if (!future.length) return;
  history.push(clone(config));
  config = future.pop();
  historyState();
  renderPanel();
  refresh();
};
$("print").onclick = () => {
  const invalid = $("panel").querySelector('[aria-invalid="true"]');
  if (invalid) {
    invalid.reportValidity();
    return;
  }
  if (!currentEdition) return;
  const url = URL.createObjectURL(
    new Blob([renderDocument(currentEdition)], { type: "text/html" }),
  );
  const win = window.open(url, "_blank");
  if (!win) {
    toast("Allow a new tab to print your edition.", true);
    URL.revokeObjectURL(url);
    return;
  }
  win.onload = () => {
    win.focus();
    win.print();
  };
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
document.querySelectorAll("[data-view]").forEach((b) => {
  if (b.tagName !== "BUTTON") return;
  b.onclick = () => {
    document.querySelector(".workspace").dataset.view = b.dataset.view;
    document
      .querySelectorAll(".mobile-switch button")
      .forEach((x) => x.classList.toggle("active", x === b));
    resizePaper();
  };
});
$("login-form").onsubmit = async (ev) => {
  ev.preventDefault();
  try {
    await api("/login", {
      method: "POST",
      body: JSON.stringify({ token: $("access-key").value }),
    });
    $("access-key").value = "";
    init();
  } catch (err) {
    toast(err.message, true);
  }
};
$("signout").onclick = async () => {
  await api("/logout", { method: "POST", body: "{}" });
  location.reload();
};
window.addEventListener("beforeunload", (ev) => {
  if (JSON.stringify(config) !== saved) {
    ev.preventDefault();
    ev.returnValue = "";
  }
});
async function init() {
  try {
    state = await api("/config");
    config = validateConfig(state.config);
    saved = JSON.stringify(config);
    $("login").hidden = true;
    $("app").hidden = false;
    $("signout").hidden = state.localDemo;
    $("environment").textContent = state.localDemo
      ? "Local studio · printer delivery disabled"
      : "Private studio · your Cloudflare";
    if (state.publicDemo) {
      $("demo").checked = true;
      $("demo").disabled = true;
      $("environment").textContent =
        "Public demo · fictional sources · no uploads";
      $("save").textContent = "Keep draft";
      $("public-demo-note").hidden = false;
    }
    historyState();
    renderPanel();
    await refresh();
  } catch (err) {
    if (!$("login").hidden) return;
    toast(err.message, true);
  }
}
init();

$("expand-proof").onclick = () => {
  const workspace = document.querySelector(".workspace");
  const expanded = workspace.classList.toggle("expanded");
  $("expand-proof").textContent = expanded
    ? "← Back to editor"
    : "Expand proof ↗";
  $("expand-proof").setAttribute("aria-expanded", String(expanded));
  resizePaper();
};
