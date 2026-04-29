import { BACKUP_PARENT_DIR, BACKUP_DIR, BACKUP_MAX, type BackupEntry, type SaveDataHandle } from './types.ts';
import { buildZip, parseZip, type ZipEntry } from './zip.ts';
import { toNxBytes } from '../types/nx.ts';

// ── Log routing ───────────────────────────────────────────────────────────────

let logFn: (msg: string) => void = () => {};
export function setLogHandler(fn: (msg: string) => void): void { logFn = fn; }

// ── Paths ─────────────────────────────────────────────────────────────────────

function backupPath(index: number): string { return `${BACKUP_DIR}backup.${index}.zip`; }
function metaPath(index: number):  string { return `${BACKUP_DIR}backup.${index}.meta`; }

async function readMeta(index: number): Promise<{ createdAt?: string; reason?: string }> {
    try {
        const buf = await Switch.readFile(metaPath(index));
        if (!buf) return {};
        return JSON.parse(new TextDecoder().decode(new Uint8Array(buf))) as { createdAt?: string; reason?: string };
    } catch { return {}; }
}

function writeMeta(index: number, createdAt: string, reason: string): void {
    Switch.writeFileSync(metaPath(index), new TextEncoder().encode(JSON.stringify({ createdAt, reason })));
}

// ── Directory traversal ───────────────────────────────────────────────────────

async function collectSaveFiles(dirUrl: URL, prefix: string): Promise<ZipEntry[]> {
    const entries = Switch.readDirSync(dirUrl);
    if (!entries) return [];
    const files: ZipEntry[] = [];
    for (const entry of entries) {
        const zipName = prefix ? `${prefix}/${entry}` : entry;
        // Check if sub-directory by trying readDirSync with trailing slash
        const subUrl = new URL(`${entry}/`, dirUrl);
        const subEntries = Switch.readDirSync(subUrl);
        if (subEntries !== null) {
            const sub = await collectSaveFiles(subUrl, zipName);
            files.push(...sub);
        } else {
            try {
                const buf = await Switch.readFile(new URL(entry, dirUrl));
                if (buf) {
                    files.push({ name: zipName, data: new Uint8Array(buf) });
                    logFn(`[backup] collected ${zipName} (${buf.byteLength}b)`);
                }
            } catch (e) { logFn(`[backup] skip ${zipName}: ${e}`); }
        }
    }
    return files;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createBackup(saveUrl: URL, reason: string): Promise<void> {
    logFn('[backup] createBackup start');
    try { Switch.mkdirSync(BACKUP_PARENT_DIR); } catch { /* exists */ }
    try { Switch.mkdirSync(BACKUP_DIR); } catch { /* exists */ }

    // Rotate existing slots up by one
    for (let i = BACKUP_MAX - 1; i >= 1; i--) {
        try {
            const buf = await Switch.readFile(backupPath(i - 1));
            if (buf) { Switch.writeFileSync(backupPath(i), toNxBytes(buf)); }
        } catch { /* slot empty */ }
        try {
            const meta = await readMeta(i - 1);
            if (meta.createdAt) writeMeta(i, meta.createdAt, meta.reason ?? '');
        } catch { /* no meta */ }
    }

    // Collect all save files and build zip
    logFn('[backup] collecting save files…');
    const files = await collectSaveFiles(saveUrl, '');
    logFn(`[backup] ${files.length} files collected, building zip…`);
    const zip = buildZip(files);
    Switch.writeFileSync(backupPath(0), toNxBytes(zip));
    writeMeta(0, new Date().toISOString(), reason);
    logFn(`[backup] done (zip ${zip.byteLength}b)`);
}

export async function listBackups(): Promise<BackupEntry[]> {
    const result: BackupEntry[] = [];
    for (let i = 0; i < BACKUP_MAX; i++) {
        try {
            const buf = await Switch.readFile(backupPath(i));
            if (!buf) continue;
            const meta = await readMeta(i);
            result.push({ index: i, timestamp: meta.createdAt, reason: meta.reason });
        } catch { /* slot absent */ }
    }
    return result;
}

export async function deleteBackup(index: number): Promise<void> {
    logFn(`[backup] deleteBackup ${index}`);
    try { await Switch.remove(backupPath(index)); logFn(`[backup] removed zip`); } catch (e) { logFn(`[backup] remove zip: ${e}`); }
    try { await Switch.remove(metaPath(index)); logFn(`[backup] removed meta`); } catch (e) { logFn(`[backup] remove meta: ${e}`); }
}

export async function readBackup(index: number): Promise<Uint8Array> {
    const buf = await Switch.readFile(backupPath(index));
    if (!buf) throw new Error(`Backup ${index} not found`);
    return new Uint8Array(buf);
}

export async function restoreBackup(
    saveUrl: URL,
    saveData: SaveDataHandle,
    index: number,
): Promise<void> {
    logFn(`[backup] restoreBackup ${index}`);
    const buf = await Switch.readFile(backupPath(index));
    if (!buf) throw new Error(`Backup ${index} not found`);
    const files = parseZip(new Uint8Array(buf));
    logFn(`[backup] zip has ${files.length} files`);

    // First, take a new backup of current state
    await createBackup(saveUrl, 'pre-restore');

    // Restore files
    for (const file of files) {
        const parts = file.name.split('/');
        // Ensure parent directories exist
        let dirUrl = saveUrl;
        for (let i = 0; i < parts.length - 1; i++) {
            dirUrl = new URL(`${parts[i]}/`, dirUrl);
            try { Switch.mkdirSync(dirUrl); } catch { /* exists */ }
        }
        const fileUrl = new URL(file.name, saveUrl);
        Switch.writeFileSync(fileUrl, toNxBytes(file.data));
        logFn(`[backup] restored ${file.name}`);
    }

    saveData.commit();
    logFn(`[backup] restoreBackup ${index} done`);
}
