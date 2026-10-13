import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  // Dice models, the dice tray environment and the grid size model's weights
  assetsInclude: ["**/*.glb", "**/*.dds", "**/*.bin"],
  define: {
    "import.meta.env.VITE_VERSION": JSON.stringify(pkg.version),
  },
  // Agent worktrees inside the checkout hold their own index.html and src
  optimizeDeps: { entries: ["index.html"] },
  server: {
    // The backend's dev script accepts connections from this port
    port: 3000,
    strictPort: true,
    watch: { ignored: ["**/.claude/**", "**/backend/**", "**/build/**", "**/reference-docs/**"] },
  },
  build: {
    // The backend embeds build/ and caches everything under /static/ forever
    outDir: "build",
    assetsDir: "static",
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/helpers/**/*.test.ts"],
  },
});
