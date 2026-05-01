import { CHAR_INFO_RAW_SIZE, isEmptySlot, readUtf16LE, charInfoGender } from '../mii/charinfo.ts';
import { parseLtd, serializeLtd, type LtdFile } from '../mii/ltd.ts';
import type { MiiSummary } from '../mii/index.ts';
import { MII_SLOT_COUNT, type SaveDataHandle } from './types.ts';
import { toNxBytes } from '../types/nx.ts';
import { readFacepaintBlobs, facepaintUrls, readFacepaintPng } from './facepaint.ts';
import { createBackup } from './backups.ts';
import { mountSave } from './mount.ts';

const MII_HASHES = {
    rawData:   '881CA27A',
    names:     '2499BFDA',
    pronoun:   '3A5EDA05',
    sexuality: 'DFC82223',
    facepaint: '5E32ADF4',
} as const;

const PERSONALITY_HASHES: readonly string[] = [
    '43CD364F', 'CD8DBAF8', '25B48224', '607BA160', '68E1134E',
    '4913AE1A', '141EE086', '07B9D175', '81CF470A', '4D78E262',
    'FBC3FFB0', '236E2D73', 'F3C3DE59', '660C5247', '5D7D3F45',
    'AB8AE08B', '2545E583', '6CF484F4',
];

// ── Binary helpers ─────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function findBytes(data: Uint8Array, needle: Uint8Array): number {
    outer: for (let i = 0; i <= data.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (data[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function writeUtf16LE(buf: Uint8Array, offset: number, maxChars: number, str: string): void {
    const view = new DataView(buf.buffer, buf.byteOffset + offset);
    const len = Math.min(str.length, maxChars - 1);
    for (let i = 0; i < len; i++) {
        view.setUint16(i * 2, str.charCodeAt(i), true);
    }
    if (len < maxChars) view.setUint16(len * 2, 0, true);
}

// ── Sexuality bitfield ─────────────────────────────────────────────────────────

function readSexuality(bitfield: Uint8Array, slot: number): [number, number, number] {
    const base = slot * 3;
    return [0, 1, 2].map(i => {
        const bit = base + i;
        return (bitfield[Math.floor(bit / 8)] >> (bit % 8)) & 1;
    }) as [number, number, number];
}

function writeSexuality(bitfield: Uint8Array, slot: number, bits: [number, number, number]): void {
    const base = slot * 3;
    bits.forEach((bit, i) => {
        const idx = base + i;
        const byteIdx = Math.floor(idx / 8);
        const bitPos = idx % 8;
        bitfield[byteIdx] = bit
            ? bitfield[byteIdx] | (1 << bitPos)
            : bitfield[byteIdx] & ~(1 << bitPos);
    });
}

// ── Section offset resolution ──────────────────────────────────────────────────

interface SaveOffsets {
    rawData: number;
    names: number;
    pronoun: number;
    sexuality: number;
    facepaint: number;
    personality: number[];
}

function locateSection(data: Uint8Array, hashHex: string): number {
    const hash = hexToBytes(hashHex).reverse();
    const idx = findBytes(data, hash);
    if (idx === -1) return -1;
    const offset = new DataView(data.buffer, data.byteOffset).getUint32(idx + 4, true);
    return offset + 4;
}

function resolveOffsets(data: Uint8Array): SaveOffsets {
    const offsets: SaveOffsets = {
        rawData:     locateSection(data, MII_HASHES.rawData),
        names:       locateSection(data, MII_HASHES.names),
        pronoun:     locateSection(data, MII_HASHES.pronoun),
        sexuality:   locateSection(data, MII_HASHES.sexuality),
        facepaint:   locateSection(data, MII_HASHES.facepaint),
        personality: PERSONALITY_HASHES.map(h => locateSection(data, h)),
    };

    const critical = ['rawData', 'names', 'pronoun', 'sexuality'] as const;
    const missing = critical.filter(k => offsets[k] === -1);
    if (missing.length > 0) {
        throw new Error(`Save structure not recognized (missing: ${missing.join(', ')}) – wrong game version or corrupted save?`);
    }

    return offsets;
}

// ── SaveManager ────────────────────────────────────────────────────────────────

export class SaveManager {
    private miiSav: Uint8Array;
    private offsets: SaveOffsets;

    private constructor(
        miiSav: Uint8Array,
        readonly saveUrl: URL,
        readonly saveData: SaveDataHandle,
    ) {
        this.miiSav = miiSav;
        this.offsets = resolveOffsets(miiSav);
    }

    static async load(): Promise<SaveManager> {
        const { url, saveData } = await mountSave();
        const buf = await Switch.readFile(new URL('Mii.sav', url));
        if (!buf) throw new Error('Mii.sav not found');
        return new SaveManager(new Uint8Array(buf), url, saveData);
    }

    async reload(): Promise<void> {
        const buf = await Switch.readFile(new URL('Mii.sav', this.saveUrl));
        if (!buf) throw new Error('Mii.sav not found');
        this.miiSav = new Uint8Array(buf);
        this.offsets = resolveOffsets(this.miiSav);
    }

    getMiiSummaries(): MiiSummary[] {
        const { offsets: off, miiSav } = this;
        const summaries: MiiSummary[] = [];

        for (let slot = 0; slot < MII_SLOT_COUNT; slot++) {
            const rawStart = off.rawData + slot * CHAR_INFO_RAW_SIZE;
            const rawBuf = miiSav.slice(rawStart, rawStart + CHAR_INFO_RAW_SIZE);
            if (isEmptySlot(rawBuf)) continue;

            summaries.push({
                slot,
                name:          readUtf16LE(miiSav, off.names  + slot * 64,  32),
                pronunciation: readUtf16LE(miiSav, off.pronoun + slot * 128, 64),
                gender:        charInfoGender(rawBuf),
            });
        }
        return summaries;
    }

    async exportMii(slot: number): Promise<Uint8Array> {
        const { offsets: off, miiSav } = this;
        const rawStart = off.rawData + slot * CHAR_INFO_RAW_SIZE;
        const rawBuf = miiSav.slice(rawStart, rawStart + CHAR_INFO_RAW_SIZE);
        if (isEmptySlot(rawBuf)) throw new Error(`Slot ${slot} is empty`);

        const personality = off.personality.map(pOff => {
            if (pOff === -1) return 0;
            return new DataView(miiSav.buffer, miiSav.byteOffset + pOff + slot * 4).getUint32(0, true);
        });

        const fpIndex = miiSav[off.facepaint + slot * 4];
        const { canvas, ugctex } = fpIndex !== 0xFF
            ? await readFacepaintBlobs(this.saveUrl, fpIndex)
            : {};

        const ltd: LtdFile = {
            version:       3,
            charInfo:      rawBuf,
            personality,
            name:          readUtf16LE(miiSav, off.names  + slot * 64,  32),
            pronunciation: readUtf16LE(miiSav, off.pronoun + slot * 128, 64),
            sexuality:     readSexuality(miiSav.slice(off.sexuality, off.sexuality + 27), slot),
            canvas,
            ugctex,
        };

        return serializeLtd(ltd);
    }

    async importMii(slot: number, ltdBuf: Uint8Array): Promise<void> {
        const ltd = parseLtd(ltdBuf);
        const { offsets: off, miiSav } = this;

        miiSav.set(ltd.charInfo, off.rawData + slot * CHAR_INFO_RAW_SIZE);

        const nameBase = off.names + slot * 64;
        miiSav.fill(0, nameBase, nameBase + 64);
        writeUtf16LE(miiSav, nameBase, 32, ltd.name);

        const pronBase = off.pronoun + slot * 128;
        miiSav.fill(0, pronBase, pronBase + 128);
        writeUtf16LE(miiSav, pronBase, 64, ltd.pronunciation);

        const sexBuf = miiSav.slice(off.sexuality, off.sexuality + 27);
        writeSexuality(sexBuf, slot, ltd.sexuality);
        miiSav.set(sexBuf, off.sexuality);

        ltd.personality.forEach((val, i) => {
            const pOff = off.personality[i];
            if (pOff !== -1) new DataView(miiSav.buffer, miiSav.byteOffset + pOff + slot * 4).setUint32(0, val, true);
        });

        if (ltd.canvas || ltd.ugctex) {
            let fpIndex = miiSav[off.facepaint + slot * 4];
            if (fpIndex === 0xFF) fpIndex = slot % 99;
            const urls = facepaintUrls(this.saveUrl, fpIndex);
            if (ltd.canvas)  Switch.writeFileSync(urls.canvas,  toNxBytes(ltd.canvas));
            if (ltd.ugctex)  Switch.writeFileSync(urls.ugctex, toNxBytes(ltd.ugctex));
            miiSav.fill(0x00, off.facepaint + slot * 4, off.facepaint + slot * 4 + 4);
            miiSav[off.facepaint + slot * 4] = fpIndex;
        } else {
            miiSav.fill(0xFF, off.facepaint + slot * 4, off.facepaint + slot * 4 + 4);
        }
    }

    getDebugInfo(): Record<string, unknown> {
        const { offsets: off, miiSav } = this;
        const offsetStatus: Record<string, number> = {
            rawData:   off.rawData,
            names:     off.names,
            pronoun:   off.pronoun,
            sexuality: off.sexuality,
            facepaint: off.facepaint,
        };
        off.personality.forEach((v, i) => { offsetStatus[`personality_${i}`] = v; });

        let miiCount = 0;
        if (off.rawData !== -1) {
            for (let slot = 0; slot < MII_SLOT_COUNT; slot++) {
                const start = off.rawData + slot * CHAR_INFO_RAW_SIZE;
                if (!isEmptySlot(miiSav.slice(start, start + CHAR_INFO_RAW_SIZE))) miiCount++;
            }
        }

        return {
            saveSize: miiSav.byteLength,
            miiCount,
            offsets: offsetStatus,
            missingOffsets: Object.entries(offsetStatus).filter(([, v]) => v === -1).map(([k]) => k),
        };
    }

    async getFacepaintPng(slot: number): Promise<Uint8Array | null> {
        const fpIndex = this.miiSav[this.offsets.facepaint + slot * 4];
        if (fpIndex === 0xFF) return null;
        return readFacepaintPng(this.saveUrl, fpIndex);
    }

    async save(): Promise<void> {
        await createBackup(this.saveUrl, 'pre-import');
        Switch.writeFileSync(new URL('Mii.sav', this.saveUrl), toNxBytes(this.miiSav));
        this.saveData.commit();
    }
}
