import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev mode the Vite server runs on :5173. The Swift engine runs
// on :8089. The client code (ws.ts) detects the :5173 port and
// connects the WebSocket directly to :8089 on the same hostname,
// bypassing this proxy. This avoids the Vite proxy WebSocket
// forwarding bug that breaks connections from non-localhost clients
// (e.g. iPad on the same LAN): the page loads fine over HTTP but the
// WS upgrade silently fails through the proxy.
//
// The proxy entry is kept here as a localhost-only fallback for
// tooling that hard-codes port 5173 for WebSocket connections.
//
// The dev server binds 0.0.0.0 so an iPad on the same network can
// reach `http://<mac-hostname>.local:5173` for live reload.
// App Store builds must not show dev tooling (build-timestamp bar,
// Analyze button, debug panel) or ship source maps. The Xcode
// preBuildScript passes VITE_APP_CONFIG=$CONFIGURATION, so archive
// builds (Release) strip them; Xcode Debug builds and manual
// `npm run build` keep them.
const releaseBuild = process.env.VITE_APP_CONFIG === "Release";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
    __DEV_TOOLS__: JSON.stringify(!releaseBuild)
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8089",
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: !releaseBuild
  }
});
