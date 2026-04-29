import { Button } from '@nx.js/constants';
import qrcode from 'qrcode-generator';
import { SaveManager, createBackup, listBackups, restoreBackup, setLogHandler, type BackupEntry } from './save/index.ts';
import { type NxScreen } from './types/nx.ts';

const ctx = (screen as unknown as NxScreen).getContext('2d');
const W = screen.width;  // 1280
const H = screen.height; // 720

const HEADER_H = 64;
const FOOTER_H = 52;
const CONTENT_H = H - HEADER_H - FOOTER_H;
const PANEL_W = W / 2;

const C = {
    bg:        '#0F172A',
    surface:   '#1E293B',
    border:    '#334155',
    yellow:    '#FFD000',
    text:      '#F1F5F9',
    muted:     '#94A3B8',
    highlight: '#FFF9C4',
    green:     '#86EFAC',
    red:       '#FCA5A5',
};

// ── State ─────────────────────────────────────────────────────────────────────

interface QrData { modules: number; isDark: (r: number, c: number) => boolean }
interface Status  { msg: string; ok: boolean; until: number }

let backups:        BackupEntry[] = [];
let selectedBackup  = 0;
let status:         Status | null = null;
let busy            = false;
let dirty           = true;
let url             = '';
let qrData:         QrData | null = null;
let showLog         = false;
let appIcon:        ImageBitmap | null = null;

const logLines: string[] = [];
const prevButtons = new Uint8Array(32);

function addLog(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    logLines.unshift(`[${ts}] ${msg}`);
    if (logLines.length > 60) logLines.pop();
    dirty = true;
}

// ── IP detection ──────────────────────────────────────────────────────────────

function detectIp(): string {
    addLog('Detecting IP…');

    try {
        // Switch.networkInfo() returns { ip, gateway, subnetMask }
        type NetworkInfo = { ip: string; gateway: string; subnetMask: string };
        const net = (Switch as unknown as { networkInfo(): NetworkInfo }).networkInfo();
        addLog(`networkInfo() = ${JSON.stringify(net)}`);
        const ip = net.ip;
        if (ip && ip !== '0.0.0.0') return ip;
        addLog('networkInterfaces().ip empty or 0.0.0.0');
    } catch (e) {
        addLog(`networkInterfaces() threw: ${e}`);
    }

    addLog('Falling back to placeholder');
    return '<Switch-IP>';
}

// ── QR code ───────────────────────────────────────────────────────────────────

function buildQrData(text: string): void {
    try {
        addLog(`Building QR for: ${text}`);
        const qr = qrcode(0, 'M');
        qr.addData(text);
        qr.make();
        qrData = { modules: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
        addLog(`QR ready: ${qrData.modules}×${qrData.modules} modules`);
    } catch (e) {
        addLog(`QR build failed: ${e}`);
    }
}

// ── Render ────────────────────────────────────────────────────────────────────

function drawHeader(): void {
    ctx.fillStyle = C.yellow;
    ctx.fillRect(0, 0, W, HEADER_H);

    const iconSize = 44;
    const iconX    = 10;
    const iconY    = (HEADER_H - iconSize) / 2;

    if (appIcon) {
        ctx.drawImage(appIcon, iconX, iconY, iconSize, iconSize);
    }

    const textX = appIcon ? iconX + iconSize + 10 : 24;
    ctx.fillStyle = '#1A1A2E';
    ctx.font = 'bold 26px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Mii Sharing', textX, HEADER_H / 2);
}

function drawQrPanel(): void {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, HEADER_H, PANEL_W, CONTENT_H);

    ctx.fillStyle = C.muted;
    ctx.font = '15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Open on your phone:', PANEL_W / 2, HEADER_H + 20);

    if (qrData) {
        const cell  = Math.max(4, Math.floor(220 / qrData.modules));
        const size  = qrData.modules * cell;
        const pad   = 12;
        const total = size + pad * 2;
        const qx    = Math.floor((PANEL_W - total) / 2);
        const qy    = HEADER_H + 50;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(qx, qy, total, total);

        for (let r = 0; r < qrData.modules; r++) {
            for (let c = 0; c < qrData.modules; c++) {
                if (qrData.isDark(r, c)) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(qx + pad + c * cell, qy + pad + r * cell, cell, cell);
                }
            }
        }

        ctx.fillStyle = C.text;
        ctx.font = 'bold 18px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(url, PANEL_W / 2, qy + total + 14);
    } else {
        ctx.fillStyle = C.muted;
        ctx.font = '13px system-ui';
        ctx.fillText('QR unavailable — type the URL below:', PANEL_W / 2, HEADER_H + 60);
        ctx.fillStyle = C.text;
        ctx.font = 'bold 18px system-ui';
        ctx.fillText(url, PANEL_W / 2, HEADER_H + 90);
    }

    if (status && Date.now() < status.until) {
        ctx.fillStyle = status.ok ? C.green : C.red;
        ctx.font = '13px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(status.msg, PANEL_W / 2, H - FOOTER_H - 8);
    }
}

function drawBackupPanel(): void {
    const x = PANEL_W;

    ctx.fillStyle = C.surface;
    ctx.fillRect(x, HEADER_H, PANEL_W, CONTENT_H);
    ctx.fillStyle = C.border;
    ctx.fillRect(x, HEADER_H, 1, CONTENT_H);

    ctx.fillStyle = C.muted;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('BACKUPS', x + 24, HEADER_H + 18);

    if (backups.length === 0) {
        ctx.fillStyle = C.muted;
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No backups yet.', x + PANEL_W / 2, HEADER_H + CONTENT_H / 2 - 12);
        ctx.font = '12px system-ui';
        ctx.fillText('Press Y to create one.', x + PANEL_W / 2, HEADER_H + CONTENT_H / 2 + 14);
        return;
    }

    const ITEM_H = 52;
    const listY  = HEADER_H + 48;

    backups.forEach((b, i) => {
        const iy    = listY + i * ITEM_H;
        const isSel = i === selectedBackup;

        if (isSel) {
            ctx.fillStyle = C.highlight;
            ctx.fillRect(x, iy, PANEL_W, ITEM_H);
            ctx.fillStyle = C.yellow;
            ctx.fillRect(x, iy, 4, ITEM_H);
        }

        ctx.fillStyle = isSel ? '#1A1A2E' : C.text;
        ctx.font = isSel ? 'bold 15px system-ui' : '15px system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Backup ${b.index}`, x + 24, iy + ITEM_H / 2 - 8);

        ctx.fillStyle = isSel ? '#444466' : C.muted;
        ctx.font = '11px system-ui';
        ctx.textBaseline = 'middle';
        const tsLabel = b.timestamp ? new Date(b.timestamp).toLocaleString() : 'Unknown time';
        const reasonLabel = b.reason === 'pre-import' ? ' · Before import' : b.reason === 'pre-restore' ? ' · Before restore' : b.reason ? ` · ${b.reason}` : '';
        ctx.fillText(tsLabel + reasonLabel, x + 24, iy + ITEM_H / 2 + 9);

        ctx.fillStyle = C.border;
        ctx.fillRect(x + 16, iy + ITEM_H - 1, PANEL_W - 32, 1);
    });
}

function drawFooter(): void {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, H - FOOTER_H, W, 1);

    const hints: [string, string][] = busy
        ? [['…', 'Working']]
        : [
            ['Y', 'New Backup'],
            ['A', 'Restore'],
            ['X', showLog ? 'Hide Log' : 'Log'],
            ['+', 'Exit'],
        ];

    let hx = W - 20;
    const fy = H - FOOTER_H / 2;

    for (const [btn, label] of hints) {
        ctx.font = '13px system-ui';
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, hx, fy);
        hx -= tw + 10;

        ctx.fillStyle = C.yellow;
        ctx.beginPath();
        ctx.arc(hx - 11, fy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1A1A2E';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(btn, hx - 11, fy);
        hx -= 30;
    }
}

function drawLogOverlay(): void {
    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = C.yellow;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DEBUG LOG  —  X to close', 20, 14);

    ctx.fillStyle = C.muted;
    ctx.font = '11px monospace';
    logLines.slice(0, 38).forEach((line, i) => {
        ctx.fillText(line.slice(0, 140), 20, 38 + i * 16);
    });
}

function render(): void {
    if (showLog) {
        drawLogOverlay();
    } else {
        drawHeader();
        drawQrPanel();
        drawBackupPanel();
        drawFooter();
    }
    dirty = false;
}

// ── Input ─────────────────────────────────────────────────────────────────────

function justPressed(pad: Gamepad, btn: Button): boolean {
    const now  = pad.buttons[btn]?.pressed ? 1 : 0;
    const prev = prevButtons[btn];
    prevButtons[btn] = now;
    return now === 1 && prev === 0;
}

function setStatus(msg: string, ok: boolean): void {
    addLog(ok ? `OK: ${msg}` : `ERR: ${msg}`);
    status = { msg, ok, until: Date.now() + 4000 };
    dirty = true;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startUI(manager: SaveManager): Promise<void> {
    setLogHandler(addLog);
    addLog('startUI()');

    try {
        const buf = await Switch.readFile(new URL('logo.png', Switch.entrypoint));
        if (buf) {
            const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' });
            appIcon = await createImageBitmap(blob);
            addLog('App icon loaded');
        }
    } catch (e) { addLog(`Icon load failed: ${e}`); }

    const ip = detectIp();
    url = `http://${ip}:8080`;
    addLog(`URL: ${url}`);

    buildQrData(url);

    addLog('Loading backups…');
    backups = await listBackups().catch(e => { addLog(`listBackups failed: ${e}`); return []; });
    addLog(`Backups loaded: ${backups.length}`);
    dirty = true;

    let lastInput = 0;

    function tick(): void {
        // Schedule next frame first — ensures the loop survives any synchronous error below
        requestAnimationFrame(tick);

        try {
            const now = Date.now();

            if (status && now >= status.until) {
                status = null;
                dirty = true;
            }

            // Throttle getGamepads() to 10fps — calling at 60fps crashes nx.js after ~10s
            if (now - lastInput >= 100) {
                lastInput = now;
                const pad = navigator.getGamepads()[0];
                if (pad) {
                    if (justPressed(pad, Button.X)) {
                        showLog = !showLog;
                        dirty = true;
                    }
                    if (justPressed(pad, Button.Plus)) Switch.exit();

                    if (!busy && !showLog) {
                        if (justPressed(pad, Button.Up) && selectedBackup > 0) {
                            selectedBackup--;
                            dirty = true;
                        }
                        if (justPressed(pad, Button.Down) && selectedBackup < backups.length - 1) {
                            selectedBackup++;
                            dirty = true;
                        }

                        if (justPressed(pad, Button.A) && backups.length > 0) {
                            const idx = backups[selectedBackup].index;
                            addLog(`Restoring backup ${idx}…`);
                            busy = true; dirty = true;
                            restoreBackup(manager.saveUrl, manager.saveData, idx)
                                .then(() => manager.reload())
                                .then(() => setStatus('Backup restored.', true))
                                .catch(e => setStatus(`Restore failed: ${e}`, false))
                                .finally(() => { busy = false; dirty = true; });
                        }

                        if (justPressed(pad, Button.Y)) {
                            addLog('Creating backup…');
                            busy = true; dirty = true;
                            createBackup(manager.saveUrl, 'manual')
                                .then(() => listBackups())
                                .then(list => {
                                    backups = list;
                                    addLog(`Backup done. Count: ${list.length}`);
                                })
                                .then(() => setStatus('Backup created.', true))
                                .catch(e => setStatus(`Backup failed: ${e}`, false))
                                .finally(() => { busy = false; dirty = true; });
                        }
                    }
                }
            }

            if (dirty) render();
        } catch (e) {
            addLog(`tick error: ${e}`);
            dirty = true;
        }
    }

    requestAnimationFrame(tick);
}
