// .ltd v3 – portable Mii exchange format

import { type CharInfoRaw, CHAR_INFO_RAW_SIZE, readUtf16LE } from './charinfo.ts';

export const LTD_VERSION = 3;
export const PERSONALITY_COUNT = 18;

const CANVAS_MAGIC = new Uint8Array([0xA3, 0xA3, 0xA3, 0xA3]);
const UGCTEX_MAGIC = new Uint8Array([0xA4, 0xA4, 0xA4, 0xA4]);

export interface LtdFile {
    version: number;           // always 3
    charInfo: CharInfoRaw;
    personality: number[];     // 18 × uint32
    name: string;              // UTF-16LE, 64 bytes max
    pronunciation: string;     // UTF-16LE, 128 bytes max
    sexuality: [number, number, number]; // 3 bits as booleans
    canvas?: Uint8Array;       // UgcFacePaint canvas.zs
    ugctex?: Uint8Array;       // UgcFacePaint ugctex.zs
}

function writeUtf16LE(dst: Uint8Array, offset: number, byteLen: number, str: string): void {
    const view = new DataView(dst.buffer, dst.byteOffset + offset);
    const maxChars = byteLen / 2;
    const len = Math.min(str.length, maxChars - 1);
    for (let i = 0; i < len; i++) {
        view.setUint16(i * 2, str.charCodeAt(i), true);
    }
}

function findBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
    outer: for (let i = from; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

export function parseLtd(buf: Uint8Array): LtdFile {
    if (buf[0] !== LTD_VERSION) {
        throw new Error(`Unsupported .ltd version: ${buf[0]}`);
    }

    const hasCanvas = buf[1] === 1;
    const hasUgctex = buf[2] === 1;

    const charInfo: CharInfoRaw = buf.slice(4, 4 + CHAR_INFO_RAW_SIZE);

    const personality: number[] = [];
    const pView = new DataView(buf.buffer, buf.byteOffset + 160);
    for (let i = 0; i < PERSONALITY_COUNT; i++) {
        personality.push(pView.getUint32(i * 4, true));
    }

    const name = readUtf16LE(buf, 232, 32);
    const pronunciation = readUtf16LE(buf, 296, 64);

    const sexByte = buf[424];
    const sexuality: [number, number, number] = [
        (sexByte >> 0) & 1,
        (sexByte >> 1) & 1,
        (sexByte >> 2) & 1,
    ];

    let canvas: Uint8Array | undefined;
    let ugctex: Uint8Array | undefined;

    if (hasCanvas || hasUgctex) {
        const canvasIdx = findBytes(buf, CANVAS_MAGIC, 428);
        const ugctexIdx = findBytes(buf, UGCTEX_MAGIC, 428);

        if (hasCanvas && canvasIdx !== -1) {
            const start = canvasIdx + 4;
            const end = ugctexIdx !== -1 ? ugctexIdx : buf.length;
            canvas = buf.slice(start, end);
        }
        if (hasUgctex && ugctexIdx !== -1) {
            ugctex = buf.slice(ugctexIdx + 4);
        }
    }

    return { version: LTD_VERSION, charInfo, personality, name, pronunciation, sexuality, canvas, ugctex };
}

export function serializeLtd(ltd: LtdFile): Uint8Array {
    const hasCanvas = ltd.canvas !== undefined ? 1 : 0;
    const hasUgctex = ltd.ugctex !== undefined ? 1 : 0;

    const fixedSize = 428; // 4 + 156 + 72 + 64 + 128 + 3 + 1
    const blobSize =
        (hasCanvas ? 4 + (ltd.canvas?.length ?? 0) : 0) +
        (hasUgctex ? 4 + (ltd.ugctex?.length ?? 0) : 0);

    const buf = new Uint8Array(fixedSize + blobSize);

    buf[0] = LTD_VERSION;
    buf[1] = hasCanvas;
    buf[2] = hasUgctex;
    buf[3] = 0;

    buf.set(ltd.charInfo, 4);

    const pView = new DataView(buf.buffer, 160);
    for (let i = 0; i < PERSONALITY_COUNT; i++) {
        pView.setUint32(i * 4, ltd.personality[i] ?? 0, true);
    }

    writeUtf16LE(buf, 232, 64, ltd.name);
    writeUtf16LE(buf, 296, 128, ltd.pronunciation);

    buf[424] =
        ((ltd.sexuality[0] & 1) << 0) |
        ((ltd.sexuality[1] & 1) << 1) |
        ((ltd.sexuality[2] & 1) << 2);
    buf[427] = 0;

    let pos = fixedSize;
    if (hasCanvas && ltd.canvas) {
        buf.set(CANVAS_MAGIC, pos); pos += 4;
        buf.set(ltd.canvas, pos); pos += ltd.canvas.length;
    }
    if (hasUgctex && ltd.ugctex) {
        buf.set(UGCTEX_MAGIC, pos); pos += 4;
        buf.set(ltd.ugctex, pos);
    }

    return buf;
}
