import { SaveManager } from './save/index.ts';
import { startServer, logEvent } from './server.ts';
import { startUI } from './ui.ts';
import { type NxScreen } from './types/nx.ts';

const splash = (screen as unknown as NxScreen).getContext('2d');

addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    splash.fillStyle = '#111';
    splash.fillRect(0, 0, screen.width, screen.height);
    splash.fillStyle = '#FF6B6B';
    splash.font = '20px system-ui';
    splash.textAlign = 'center';
    splash.textBaseline = 'middle';
    splash.fillText(`Unhandled: ${String(e.reason).slice(0, 120)}`, screen.width / 2, screen.height / 2);
});

function drawStatus(msg: string, color = '#FFFFFF'): void {
    splash.clearRect(0, 0, screen.width, screen.height);
    splash.fillStyle = color;
    splash.font = '36px system-ui';
    splash.textAlign = 'center';
    splash.textBaseline = 'middle';
    splash.fillText(msg, screen.width / 2, screen.height / 2);
}

async function main(): Promise<void> {
    drawStatus('Loading save data…');

    let manager: SaveManager;
    try {
        manager = await SaveManager.load();
    } catch (e) {
        drawStatus(`Error: ${e}`, '#FF6B6B');
        await new Promise(() => {});
        return;
    }

    try {
        startServer(manager);
    } catch { /* server error is non-fatal */ }

    drawStatus('Starting UI…');

    try {
        await startUI(manager, logEvent);
    } catch (e) {
        drawStatus(`UI Error: ${String(e).slice(0, 80)}`, '#FF4444');
        await new Promise(() => {});
    }
}

main().catch(e => {
    splash.clearRect(0, 0, screen.width, screen.height);
    splash.fillStyle = '#FF4444';
    splash.font = '24px system-ui';
    splash.textAlign = 'center';
    splash.textBaseline = 'middle';
    splash.fillText(String(e).slice(0, 120), screen.width / 2, screen.height / 2);
});
