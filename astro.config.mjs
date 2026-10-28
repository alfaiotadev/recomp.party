import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://recomp.party",
  trailingSlash: "always",
  build: { format: "directory" },
});
