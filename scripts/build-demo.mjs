import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "work/public-demo");
// The public release is a concept landing page only. Rebuild from an explicit
// asset list so earlier studio files and source archives cannot remain public.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of [
  "index.html",
  "landing.css",
  "landing.mjs",
  "folio-mark.svg",
  "folio-hero.png",
  "folio-editorial.png",
])
  await cp(resolve(root, "public", file), resolve(target, file));
console.log(
  "Built concept landing only. Studio, account adapters and source ZIP are excluded.",
);
