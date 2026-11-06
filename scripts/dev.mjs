import http from "node:http";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PressService } from "../src/service.mjs";
const root = resolve(import.meta.dirname, "..");
const statePath = resolve(root, "work/local-state.json");
await mkdir(resolve(root, "work"), { recursive: true });
let data = {};
try {
  data = JSON.parse(await readFile(statePath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const persist = async () => {
  await writeFile(statePath + ".tmp", JSON.stringify(data), { mode: 0o600 });
  await rename(statePath + ".tmp", statePath);
};
const store = {
  get: async (k) => structuredClone(data[k]),
  put: async (k, v) => {
    if (typeof k === "object") Object.assign(data, structuredClone(k));
    else data[k] = structuredClone(v);
    await persist();
  },
  delete: async (k) => {
    delete data[k];
    await persist();
  },
  list: async ({ prefix }) =>
    new Map(
      Object.entries(data)
        .filter(([k]) => k.startsWith(prefix))
        .sort()
        .map(([k, v]) => [k, structuredClone(v)]),
    ),
};
const service = new PressService(store, { LOCAL_DEMO: true });
const server = http.createServer(async (req, res) => {
  try {
    if (
      req.headers.host !== `127.0.0.1:${server.address().port}` &&
      req.headers.host !== `localhost:${server.address().port}`
    ) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    let result;
    if (url.pathname.startsWith("/api/")) {
      const parts = [];
      let size = 0;
      for await (const p of req) {
        size += p.length;
        if (size > 200000) {
          res.writeHead(413).end();
          return;
        }
        parts.push(p);
      }
      result = await service.handle(
        new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(parts) }
            : {}),
        }),
      );
    } else {
      const pathname =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const path = resolve(root, "public", "." + pathname);
      if (!path.startsWith(resolve(root, "public") + "/")) {
        res.writeHead(403).end();
        return;
      }
      const bytes = await readFile(path);
      const type =
        {
          ".html": "text/html",
          ".css": "text/css",
          ".mjs": "text/javascript",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".webp": "image/webp",
        }[extname(path)] || "application/octet-stream";
      result = new Response(bytes, { headers: { "Content-Type": type } });
    }
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log(
    `Morning Edition preview: http://127.0.0.1:${server.address().port} — local only; printing disabled`,
  ),
);
