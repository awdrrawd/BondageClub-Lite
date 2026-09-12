import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: { index: "index.html", architecture: "docs/architecture/index.html" },
    },
  },
});
