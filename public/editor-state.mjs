import { validateConfig } from "./core.mjs";

// Capture before awaiting the network: newer edits must remain unsaved.
export async function saveConfigSnapshot(config, persist) {
  const snapshot = JSON.stringify(validateConfig(config));
  await persist(snapshot);
  return snapshot;
}
