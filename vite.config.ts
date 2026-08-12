import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
    host: true,
    // Served publicly through a Cloudflare Tunnel at dex.infiniteledgers.com,
    // which proxies with that Host header -- Vite's preview server rejects
    // unrecognized Host headers by default, so it needs to be allow-listed.
    allowedHosts: ["dex.infiniteledgers.com"],
  },
  define: {
    // @cosmjs / cosmos-sdk libs expect a Buffer/global shim in some code paths
    global: "globalThis",
  },
});
