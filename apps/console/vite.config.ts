import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: path.join(rootDir, "ui"),
  base: "/",
  build: {
    outDir: path.join(rootDir, "dist", "ui"),
    emptyOutDir: true,
    sourcemap: true,
  },
})
