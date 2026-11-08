// This branch is the isolated Cloudflare Workers hosting trial.
// Keep this provider selection off main until the Cloudflare build and device QA pass.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Pin Nitro to its Cloudflare Workers module preset. Nitro already ships with
  // this project, so the trial does not need a new framework adapter or plugin.
  nitro: {
    preset: "cloudflare-module",
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
    },
  },
  tanstackStart: {
    // Preserve the app's custom SSR error wrapper.
    server: { entry: "server" },
  },
});
