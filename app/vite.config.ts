// app/vite.config.ts
// NEW FILE (to be created)

import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// Dev server for the two-tab GUI. root = app/, the video is served from the same public/ folder Remotion uses.
export default defineConfig({
  root: "app",
  publicDir: "../public",
  plugins: [react()],
  server: {host: true, port: 5173, fs: {allow: [".."]}}, // host: true so a Codespace can forward the port
});