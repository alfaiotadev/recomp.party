import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://recomp.party",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
});
