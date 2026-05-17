import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-storyworm",
  description: "Round-robin one-sentence story. Every 30 seconds a new peer is the author.",
  accentHex: "#59c6a3",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
