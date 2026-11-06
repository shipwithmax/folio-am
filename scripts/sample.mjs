import { writeFile } from "node:fs/promises";
import { defaults, edition, sampleFeeds } from "../public/core.mjs";
import { presetModules } from "../public/modules.mjs";
import { renderDocument } from "../public/render.mjs";
import { renderPDF } from "../bridge/print.mjs";
const ed = edition(
  { ...defaults, modules: presetModules("balanced") },
  sampleFeeds(),
  new Date(),
  true,
);
const html = renderDocument(ed);
await writeFile(new URL("../../sample-edition.html", import.meta.url), html);
await renderPDF(
  html,
  new URL("../../sample-edition.pdf", import.meta.url).pathname,
  { paper: "Letter", color: "mono" },
);
console.log("Sample HTML and PDF generated. No printer contacted.");
