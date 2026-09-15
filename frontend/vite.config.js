import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  target: "http://127.0.0.1:8000",
  changeOrigin: true,
  rewrite: path => path.replace(/^\/api-proxy/, "")
};

export default defineConfig({
  plugins: [react()],
  server: {proxy: {"/api-proxy": apiProxy}},
  preview: {proxy: {"/api-proxy": apiProxy}}
});
