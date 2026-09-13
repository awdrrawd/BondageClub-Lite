import { copyFile } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    name: "publish-monitor-doc",
    async writeBundle(options) {
      await copyFile("docs/monitor.md", `${options.dir ?? "dist"}/monitor/monitor.md`);
    },
  }],
  build: {
    rolldownOptions: {
      input: { index: "index.html", architecture: "docs/architecture/index.html" },
    },
  },
});
