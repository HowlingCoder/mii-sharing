import { listen } from '@nx.js/http';
import { SaveManager, listBackups, restoreBackup, readBackup, deleteBackup } from './save/index.ts';
import { toNxBytes } from './types/nx.ts';

const PORT = 8080;

const eventLog: Array<{ time: string; msg: string }> = [];

export function logEvent(msg: string): void {
    eventLog.unshift({ time: new Date().toISOString(), msg });
    if (eventLog.length > 50) eventLog.pop();
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
}

function err(msg: string, status = 400): Response {
    return json({ error: msg }, status);
}

async function readStaticFile(path: string): Promise<Response> {
    try {
        const buf = await Switch.readFile(new URL(path, Switch.entrypoint));
        const ext = path.split('.').pop() ?? '';
        const mime: Record<string, string> = {
            html: 'text/html; charset=utf-8',
            js:   'text/javascript',
            css:  'text/css',
        };
        return new Response(buf as unknown as Uint8Array<ArrayBuffer>, {
            headers: { 'Content-Type': mime[ext] ?? 'application/octet-stream' },
        });
    } catch {
        return new Response('Not Found', { status: 404 });
    }
}

export function startServer(manager: SaveManager): void {
    listen({
        port: PORT,
        async fetch(req: Request): Promise<Response> {
            const url = new URL(req.url);
            const path = url.pathname;
            const method = req.method.toUpperCase();

            if (method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                });
            }

            if (method === 'GET' && (path === '/' || path.startsWith('/assets/'))) {
                return readStaticFile(path === '/' ? 'web/index.html' : `web${path}`);
            }

            if (method === 'GET' && path === '/miis') {
                try {
                    return json(manager.getMiiSummaries());
                } catch (e) {
                    return err(String(e), 500);
                }
            }

            const slotMatch = path.match(/^\/mii\/(\d+)$/);
            if (slotMatch) {
                const slot = parseInt(slotMatch[1], 10);
                if (isNaN(slot) || slot < 0 || slot > 69) return err('Invalid slot');

                if (method === 'GET') {
                    try {
                        const ltdBuf = await manager.exportMii(slot);
                        logEvent(`Exported slot ${slot}`);
                        return new Response(ltdBuf as unknown as Uint8Array<ArrayBuffer>, {
                            headers: {
                                'Content-Type': 'application/octet-stream',
                                'Content-Disposition': `attachment; filename="mii_slot${slot}.ltd"`,
                                'Access-Control-Allow-Origin': '*',
                            },
                        });
                    } catch (e) {
                        return err(String(e), 404);
                    }
                }

                if (method === 'POST') {
                    try {
                        const body = await req.arrayBuffer();
                        if (!body || body.byteLength === 0) return err('Body is empty');
                        await manager.importMii(slot, new Uint8Array(body));
                        await manager.save();
                        logEvent(`Imported .ltd into slot ${slot}`);
                        return json({ ok: true, slot });
                    } catch (e) {
                        logEvent(`Import slot ${slot} failed: ${e}`);
                        return err(String(e), 500);
                    }
                }
            }

            if (method === 'GET' && path === '/backups') {
                try {
                    return json(await listBackups());
                } catch (e) {
                    return err(String(e), 500);
                }
            }

            const restoreMatch = path.match(/^\/backups\/restore\/(\d+)$/);
            if (restoreMatch && method === 'POST') {
                const idx = parseInt(restoreMatch[1], 10);
                try {
                    await restoreBackup(manager.saveUrl, manager.saveData, idx);
                    await manager.reload();
                    logEvent(`Restored backup ${idx}`);
                    return json({ ok: true });
                } catch (e) {
                    return err(String(e), 500);
                }
            }

            const deleteMatch = path.match(/^\/backups\/(\d+)$/);
            if (deleteMatch && method === 'DELETE') {
                const idx = parseInt(deleteMatch[1], 10);
                try {
                    await deleteBackup(idx);
                    logEvent(`Deleted backup ${idx}`);
                    return json({ ok: true });
                } catch (e) {
                    return err(String(e), 500);
                }
            }

            const downloadMatch = path.match(/^\/backups\/download\/(\d+)$/);
            if (downloadMatch && method === 'GET') {
                const idx = parseInt(downloadMatch[1], 10);
                try {
                    const buf = toNxBytes(await readBackup(idx));
                    return new Response(buf, {
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Content-Disposition': `attachment; filename="save_backup${idx}.zip"`,
                            'Access-Control-Allow-Origin': '*',
                        },
                    });
                } catch (e) {
                    return err(String(e), 404);
                }
            }

            const facepaintMatch = path.match(/^\/facepaint\/(\d+)$/);
            if (facepaintMatch && method === 'GET') {
                const slot = parseInt(facepaintMatch[1], 10);
                try {
                    const png = await manager.getFacepaintPng(slot);
                    if (!png) return new Response('Not Found', { status: 404 });
                    return new Response(png as unknown as Uint8Array<ArrayBuffer>, {
                        headers: {
                            'Content-Type': 'image/png',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-cache',
                        },
                    });
                } catch (e) {
                    return err(String(e), 500);
                }
            }

            if (method === 'GET' && path === '/log') {
                return json(eventLog);
            }

            if (method === 'GET' && path === '/debug') {
                return json({
                    ok: true,
                    saveManagerLoaded: true,
                    ...manager.getDebugInfo(),
                    recentLog: eventLog.slice(0, 10),
                });
            }

            return new Response('Not Found', { status: 404 });
        },
    });
}
