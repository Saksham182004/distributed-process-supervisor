import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // bind-mounted volumes on macOS don't always deliver fs events into the container
    watch: { usePolling: true },
  },
});
