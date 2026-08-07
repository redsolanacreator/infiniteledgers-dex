import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  define: {
    // @cosmjs / cosmos-sdk libs expect a Buffer/global shim in some code paths
    global: "globalThis",
  },
});
