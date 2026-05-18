import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { cpSync, existsSync, mkdirSync } from 'fs'

const copySharedPlugin = () => ({
  name: 'copy-shared',
  writeBundle() {
    const src = resolve('src/shared')
    const dest = resolve('out/shared')
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
  },
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySharedPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
    plugins: [react()],
  },
})
