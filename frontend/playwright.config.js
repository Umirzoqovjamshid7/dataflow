import {defineConfig} from "@playwright/test";
import {existsSync} from "node:fs";
export default defineConfig({
  testDir:"./tests", timeout:30000, fullyParallel:false, workers:1,
  use:{baseURL:"http://127.0.0.1:4173",headless:true,trace:"retain-on-failure",
    ...(process.platform === "win32" ? {channel:existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") ? "chrome" : "msedge"} : {})},
  webServer:{command:"node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",url:"http://127.0.0.1:4173",reuseExistingServer:false},
});
