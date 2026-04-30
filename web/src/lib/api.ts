import type { Mii, Backup, LogEntry } from './types.ts';

export async function fetchMiis(): Promise<Mii[]> {
    const res = await fetch('/miis');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function exportMii(slot: number): Promise<Blob> {
    const res = await fetch(`/mii/${slot}`);
    if (!res.ok) throw new Error(await res.text());
    return res.blob();
}

export async function importMii(slot: number, file: File): Promise<void> {
    const res = await fetch(`/mii/${slot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
}

export async function importMiiBuffer(slot: number, buf: ArrayBuffer): Promise<void> {
    const res = await fetch(`/mii/${slot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buf,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
}

export async function fetchBackups(): Promise<Backup[]> {
    const res = await fetch('/backups');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function deleteBackup(index: number): Promise<void> {
    const res = await fetch(`/backups/${index}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
}

export async function downloadBackup(index: number): Promise<void> {
    const res = await fetch(`/backups/download/${index}`);
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Mii_backup${index}.sav`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export async function restoreBackup(index: number): Promise<void> {
    const res = await fetch(`/backups/restore/${index}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
}

export async function fetchLog(): Promise<LogEntry[]> {
    const res = await fetch('/log');
    if (!res.ok) return [];
    return res.json();
}
