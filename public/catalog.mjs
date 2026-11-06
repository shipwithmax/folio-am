// Public source URLs and setup references. Never put credentials in this catalog.
export const rssCatalog = [
  {
    id: "bbc-world",
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    topic: "world",
    description: "World headlines from BBC News.",
    guide: "https://www.bbc.co.uk/news/10628494",
    terms:
      "Publisher terms apply; check permitted use before commercial distribution.",
  },
  {
    id: "bbc-science",
    name: "BBC Science",
    url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    topic: "science",
    description: "Science and environment reporting.",
    guide: "https://www.bbc.co.uk/news/10628494",
    terms:
      "Publisher terms apply; check permitted use before commercial distribution.",
  },
  {
    id: "nasa",
    name: "NASA News",
    url: "https://www.nasa.gov/feed/",
    topic: "science",
    description: "Space missions, discoveries, and agency news.",
    guide: "https://www.nasa.gov/rss-feeds/",
    terms:
      "Credit NASA and retain source links. Third-party material may have separate rights.",
  },
  {
    id: "fed",
    name: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    topic: "finance",
    description: "Official Federal Reserve announcements.",
    guide: "https://www.federalreserve.gov/feeds/feeds.htm",
    terms: "Official announcements, not a live market-price feed.",
  },
];
export const connectionGuides = {
  Akiflow: {
    label: "Remote MCP · OAuth sign-in",
    url: "https://mcp.akiflow.com/mcp",
    docs: "https://product.akiflow.com/en/help/articles/4302815-akiflow-mcp",
    steps: [
      "Open the connectors settings in an MCP-compatible assistant. Add a remote HTTP server using the address below.",
      "Sign in to Akiflow in the browser window opened by that assistant. MCP is available on paid plans and during the free trial.",
      "Choose the projects and schedule you want in your paper. Ask your assistant to export only those items using the newspaper feed format.",
      "Import the reviewed file below. Connecting your assistant does not automatically connect or schedule this newspaper.",
    ],
    status:
      "Official MCP available. Direct newspaper OAuth connection is not built yet.",
    local: false,
  },
  Beeper: {
    label: "Local MCP · Beeper Desktop",
    url: "http://localhost:23373/v0/mcp",
    docs: "https://developers.beeper.com/desktop-api/mcp/",
    steps: [
      "Open Beeper Desktop on the computer that will stay awake for your morning paper.",
      "In Beeper Settings → Integrations, follow its setup instructions for your MCP client. Use the local server address below.",
      "Authorize in Beeper and select the conversations you want to include. Keep message access limited to reading.",
      "Review and import an export below. The existing local exporter is also available. Cloudflare cannot reach localhost on your computer; automated sync needs a paired desktop companion.",
    ],
    status:
      "Official local MCP available. Automatic companion-to-newspaper sync is not built yet.",
    local: true,
  },
};
export const fontNames = {
  georgia: "Georgia · classic serif",
  times: "Times · newspaper serif",
  palatino: "Palatino · literary serif",
  baskerville: "Baskerville · bookish serif",
  charter: "Charter · sturdy serif",
  garamond: "Garamond · elegant serif",
  arial: "Arial · clean sans",
  courier: "Courier · typewriter",
};
export const editorialTemplates = {
  executive: {
    name: "Executive brief",
    description: "Short, action-oriented, three items per section.",
    voice: "action",
    readingLength: "short",
    density: "compact",
    limit: 3,
  },
  readers: {
    name: "Reader’s edition",
    description: "Original wording, fuller context, more breathing room.",
    voice: "original",
    readingLength: "full",
    density: "airy",
    limit: 6,
  },
  wire: {
    name: "News wire",
    description: "Headlines and source credits for a fast scan.",
    voice: "original",
    readingLength: "headlines",
    density: "compact",
    limit: 5,
  },
  digest: {
    name: "Sunday digest",
    description: "Section introductions and short summaries.",
    voice: "editorial",
    readingLength: "short",
    density: "balanced",
    limit: 4,
  },
};
export const printerProfiles = {
  generic: "Other installed printer",
  "brother-hl-l2460dw": "Brother HL-L2460DW",
};
