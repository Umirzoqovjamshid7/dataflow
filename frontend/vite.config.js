import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxy = {
    target: env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: path => path.replace(/^\/api-proxy/, "")
  };
  return {
    plugins: [react()],
    server: {proxy: {"/api-proxy": apiProxy}},
    preview: {proxy: {"/api-proxy": apiProxy}}
  };
});
