/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';
export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                entry: 'src/main/index.ts',
                vite: {
                    build: {
                        outDir: 'dist/main',
                        rollupOptions: { external: ['electron'] },
                    },
                },
            },
            {
                entry: 'src/preload/index.ts',
                onstart: function (args) { args.reload(); },
                vite: { build: { outDir: 'dist/preload' } },
            },
        ]),
        electronRenderer(),
    ],
    resolve: {
        alias: { '@': resolve(__dirname, 'src') },
    },
    build: { outDir: 'dist/renderer' },
    server: { port: 3000 },
});
