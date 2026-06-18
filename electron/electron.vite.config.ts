import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Bundle the workspace `shared` package into main/preload so the packaged app
// doesn't need to ship the pnpm symlink — only the native deps (ssh2, keytar)
// stay external and are collected by electron-builder.
const externalize = () =>
  externalizeDepsPlugin({ exclude: ["@surge-manage/shared"] });

export default defineConfig({
  main: {
    plugins: [externalize()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalize()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
