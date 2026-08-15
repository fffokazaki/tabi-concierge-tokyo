import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // cloudflare() が worker/ のコードを workerd 上で実行する。
  // dev / preview / 本番のすべてで同じランタイムになる。
  plugins: [react(), cloudflare()],
});
