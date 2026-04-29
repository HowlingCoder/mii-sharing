import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // API_URL wins; fall back to local dev server (SWITCH_IP is for nxlink push only)
    const switchTarget = env.API_URL ?? 'http://127.0.0.1:8090';

    const proxyEntry = { target: switchTarget, changeOrigin: true };

    return {
        root: 'web',
        plugins: [
            tailwindcss(),
            svelte(),
        ],
        build: {
            outDir: '../romfs/web',
            emptyOutDir: true,
        },
        server: {
            port: 5173,
            proxy: {
                '/miis':      proxyEntry,
                '/mii':       proxyEntry,
                '/backups':   proxyEntry,
                '/log':       proxyEntry,
                '/facepaint': proxyEntry,
            },
        },
    };
});
