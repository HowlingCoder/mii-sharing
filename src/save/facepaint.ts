import { toNxBytes, type NxBytes } from '../types/nx.ts';

export interface FacepaintBlobs {
    canvas?: NxBytes;
    ugctex?: NxBytes;
}

export function facepaintUrls(saveUrl: URL, fpIndex: number) {
    const pad = String(fpIndex).padStart(2, '0');
    return {
        canvas: new URL(`Ugc/UgcFacePaint0${pad}.canvas.zs`, saveUrl),
        ugctex: new URL(`Ugc/UgcFacePaint0${pad}.ugctex.zs`, saveUrl),
    };
}

export async function readFacepaintBlobs(saveUrl: URL, fpIndex: number): Promise<FacepaintBlobs> {
    const urls = facepaintUrls(saveUrl, fpIndex);
    const result: FacepaintBlobs = {};
    try { const buf = await Switch.readFile(urls.canvas); if (buf) result.canvas = toNxBytes(buf); } catch { /* absent */ }
    try { const buf = await Switch.readFile(urls.ugctex); if (buf) result.ugctex = toNxBytes(buf); } catch { /* absent */ }
    return result;
}

// ── PNG generation ─────────────────────────────────────────────────────────────

async function decompressZstd(compressed: NxBytes): Promise<NxBytes> {
    // 'zstd' is supported by nx.js but not in the standard TS CompressionFormat union
    const ds = new DecompressionStream('zstd' as CompressionFormat);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(compressed);
    writer.close();

    const chunks: NxBytes[] = [];
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value as NxBytes);
    }

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total) as NxBytes;
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
}

// NSW block-linear deswizzle — ported from farbensplasch/tomodachi-texture-tool (MIT)
// Parameters for .canvas.zs files: 256×256 RGBA8, swizzle_mode=4
function nswDeswizzle(
    data: NxBytes,
    imWidth: number,
    imHeight: number,
    blockW: number,
    blockH: number,
    bpb: number,
    swizzleMode: number,
): NxBytes {
    // A Row is one horizontal strip of pixel-chunk bytes.
    // A Grid is a 2-D arrangement of such rows.
    type Row  = NxBytes[];
    type Grid = Row[];

    const READ          = 16;
    const readPerTile   = 32 * (1 << swizzleMode);
    const tileDataSize  = 512 * (1 << swizzleMode);
    const tileWidth     = Math.floor(64 / bpb) * blockW;
    const tileCount     = data.length / tileDataSize;
    const tilePerWidth  = Math.floor(imWidth / tileWidth);
    const ops: [number, number][] = [[2, 0], [2, 1], [4, 0], [2, 1], [1 << swizzleMode, 0]];

    // Suppress unused-parameter warnings — blockH is part of the algorithm signature
    void imHeight; void blockH;

    let di = 0;

    function concat(grids: Grid[], axis: number): Grid {
        if (axis === 0) {
            const result: Grid = [];
            for (const g of grids) for (const row of g) result.push(row);
            return result;
        }
        const result: Grid = [];
        for (let y = 0; y < grids[0].length; y++) {
            const row: Row = [];
            for (const g of grids) for (const cell of g[y]) row.push(cell);
            result.push(row);
        }
        return result;
    }

    function readTile(): Grid {
        let parts: Grid[] = [];
        for (let i = 0; i < readPerTile; i++) {
            parts.push([[data.slice(di, di + READ) as NxBytes]]);
            di += READ;
        }
        for (const [n, axis] of ops) {
            const next: Grid[] = [];
            for (let i = 0; i < parts.length; i += n) {
                next.push(concat(parts.slice(i, i + n), axis));
            }
            parts = next;
        }
        return parts[0]!;
    }

    const tiles: Grid[]    = Array.from({ length: tileCount }, readTile);
    const tileRows: Grid[] = [];
    for (let i = 0; i < tiles.length; i += tilePerWidth) {
        tileRows.push(concat(tiles.slice(i, i + tilePerWidth), 1));
    }
    const grid = concat(tileRows, 0);

    const out = new Uint8Array(data.length) as NxBytes;
    let idx = 0;
    for (const row of grid) for (const cell of row) { out.set(cell, idx); idx += cell.length; }
    return out;
}

export async function readFacepaintPng(saveUrl: URL, fpIndex: number): Promise<NxBytes | null> {
    const urls = facepaintUrls(saveUrl, fpIndex);

    let compressed: NxBytes | null = null;
    try {
        const buf = await Switch.readFile(urls.canvas);
        if (buf) compressed = toNxBytes(buf);
    } catch { /* absent */ }
    if (!compressed) return null;

    const raw  = await decompressZstd(compressed);
    const rgba = nswDeswizzle(raw, 256, 256, 1, 1, 4, 4);
    if (rgba.length !== 256 * 256 * 4) return null;

    const canvas = new OffscreenCanvas(256, 256);
    const ctx    = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), 256, 256), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer()) as NxBytes;
}
