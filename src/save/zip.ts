import { zipSync, unzipSync } from 'fflate';

export interface ZipEntry { name: string; data: Uint8Array; }

export function buildZip(files: ZipEntry[]): Uint8Array {
    return zipSync(Object.fromEntries(files.map(f => [f.name, [f.data, { level: 0 }]])));
}

export function parseZip(data: Uint8Array): ZipEntry[] {
    return Object.entries(unzipSync(data)).map(([name, data]) => ({ name, data }));
}
