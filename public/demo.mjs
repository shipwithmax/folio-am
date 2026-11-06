import { defaults, validateConfig } from "./core.mjs";

// Public hosting serves static assets only. This adapter never uploads drafts,
// imports, account credentials, or printer jobs to a shared backend.
export function createDemoApi() {
  let config = validateConfig({
    ...defaults,
    name: "The Daily Dispatch",
    owner: "You",
    city: "Your city",
  });
  return async (path, options = {}) => {
    const method = options.method || "GET";
    if (path === "/config" && method === "GET")
      return {
        config: structuredClone(config),
        publicDemo: true,
        localDemo: true,
        feeds: [],
      };
    if (path === "/config" && method === "PUT") {
      config = validateConfig(JSON.parse(options.body));
      return { config: structuredClone(config) };
    }
    if (path === "/jobs" && method === "GET") return [];
    throw Error(
      "Install your own copy to connect private sources and automatic printing. This public demo uses fictional content only.",
    );
  };
}
