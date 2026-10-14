import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    base: "/app/",
    build: {
        outDir: "../src/main/resources/static/app",
        emptyOutDir: true,
        sourcemap: true,
    },
});
