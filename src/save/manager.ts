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

// Player.sav facepaint registration (UGC.Facepaint.*, 4 bytes per facepaint ID)
const FP_PLAYER_HASHES = {
    price:   '4C9819E4',
    srcType: 'DECC8954',
    state:   '23135BC5',
    unknown: 'FFC750B6',
    hash:    'A56E42EC',
} as const;

const FP_ACTIVE_BYTES   = { price: [0xF4,0x01,0x00,0x00], srcType: [0x41,0x49,0x93,0x56], state: [0xF4,0xAD,0x7F,0x1D], unknown: [0x00,0x80,0x00,0x00] };
const FP_INACTIVE_BYTES = { price: [0x00,0x00,0x00,0x00], srcType: [0x09,0xDE,0xEE,0xB6], state: [0xA5,0x8A,0xFF,0xAF], unknown: [0x00,0x00,0x00,0x00] };

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

interface PlayerFpOffsets {
    price: number;
    srcType: number;
    state: number;
    unknown: number;
    hash: number;
}

function resolvePlayerFpOffsets(data: Uint8Array): PlayerFpOffsets {
    return {
        price:   locateSection(data, FP_PLAYER_HASHES.price),
        srcType: locateSection(data, FP_PLAYER_HASHES.srcType),
        state:   locateSection(data, FP_PLAYER_HASHES.state),
        unknown: locateSection(data, FP_PLAYER_HASHES.unknown),
        hash:    locateSection(data, FP_PLAYER_HASHES.hash),
    };
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
    private playerSav: Uint8Array;
    private offsets: SaveOffsets;
    private playerFpOffsets: PlayerFpOffsets;

    private constructor(
        miiSav: Uint8Array,
        playerSav: Uint8Array,
        readonly saveUrl: URL,
        readonly saveData: SaveDataHandle,
    ) {
        this.miiSav = miiSav;
        this.playerSav = playerSav;
        this.offsets = resolveOffsets(miiSav);
        this.playerFpOffsets = resolvePlayerFpOffsets(playerSav);
    }

    static async load(): Promise<SaveManager> {
        const { url, saveData } = await mountSave();
        const miiBuf = await Switch.readFile(new URL('Mii.sav', url));
        if (!miiBuf) throw new Error('Mii.sav not found');
        const playerBuf = await Switch.readFile(new URL('Player.sav', url));
        if (!playerBuf) throw new Error('Player.sav not found');
        return new SaveManager(new Uint8Array(miiBuf), new Uint8Array(playerBuf), url, saveData);
    }

    async reload(): Promise<void> {
        const miiBuf = await Switch.readFile(new URL('Mii.sav', this.saveUrl));
        if (!miiBuf) throw new Error('Mii.sav not found');
        const playerBuf = await Switch.readFile(new URL('Player.sav', this.saveUrl));
        if (!playerBuf) throw new Error('Player.sav not found');
        this.miiSav = new Uint8Array(miiBuf);
        this.playerSav = new Uint8Array(playerBuf);
        this.offsets = resolveOffsets(this.miiSav);
        this.playerFpOffsets = resolvePlayerFpOffsets(this.playerSav);
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
            if (fpIndex === 0xFF) {
                const used = new Set<number>();
                for (let s = 0; s < MII_SLOT_COUNT; s++) {
                    const id = miiSav[off.facepaint + s * 4];
                    if (id !== 0xFF) used.add(id);
                }
                for (let i = 0; i < 99; i++) { if (!used.has(i)) { fpIndex = i; break; } }
            }
            const urls = facepaintUrls(this.saveUrl, fpIndex);
            if (ltd.canvas)  Switch.writeFileSync(urls.canvas,  toNxBytes(ltd.canvas));
            if (ltd.ugctex)  Switch.writeFileSync(urls.ugctex, toNxBytes(ltd.ugctex));
            miiSav.fill(0x00, off.facepaint + slot * 4, off.facepaint + slot * 4 + 4);
            miiSav[off.facepaint + slot * 4] = fpIndex;
            this.registerFacepaint(fpIndex);
        } else {
            const fpIndex = miiSav[off.facepaint + slot * 4];
            if (fpIndex !== 0xFF) this.deregisterFacepaint(fpIndex);
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

        const facepaintEntries: Record<string, string> = {};
        if (off.facepaint !== -1) {
            for (let s = 0; s < MII_SLOT_COUNT; s++) {
                const base = off.facepaint + s * 4;
                const bytes = Array.from(miiSav.slice(base, base + 4))
                    .map(b => b.toString(16).padStart(2, '0')).join(' ');
                facepaintEntries[`slot_${s}`] = bytes;
            }
        }

        return {
            saveSize: miiSav.byteLength,
            miiCount,
            offsets: offsetStatus,
            missingOffsets: Object.entries(offsetStatus).filter(([, v]) => v === -1).map(([k]) => k),
            facepaintEntries,
        };
    }

    private setFpPlayerBytes(fpIndex: number, vals: typeof FP_ACTIVE_BYTES): void {
        const p = this.playerFpOffsets;
        const s = this.playerSav;
        if (p.price   !== -1) s.set(vals.price,   p.price   + fpIndex * 4);
        if (p.srcType !== -1) s.set(vals.srcType,  p.srcType + fpIndex * 4);
        if (p.state   !== -1) s.set(vals.state,    p.state   + fpIndex * 4);
        if (p.unknown !== -1) s.set(vals.unknown,  p.unknown + fpIndex * 4);
    }

    private registerFacepaint(fpIndex: number): void {
        this.setFpPlayerBytes(fpIndex, FP_ACTIVE_BYTES);
        const p = this.playerFpOffsets;
        if (p.hash !== -1) this.playerSav.set([fpIndex, 0, 8, 0], p.hash + fpIndex * 4);
    }

    private deregisterFacepaint(fpIndex: number): void {
        this.setFpPlayerBytes(fpIndex, FP_INACTIVE_BYTES);
        const p = this.playerFpOffsets;
        if (p.hash !== -1) this.playerSav.fill(0, p.hash + fpIndex * 4, p.hash + fpIndex * 4 + 4);
    }

    async getFacepaintPng(slot: number): Promise<Uint8Array | null> {
        const fpIndex = this.miiSav[this.offsets.facepaint + slot * 4];
        if (fpIndex === 0xFF) return null;
        return readFacepaintPng(this.saveUrl, fpIndex);
    }

    async save(): Promise<void> {
        await createBackup(this.saveUrl, 'pre-import');
        Switch.writeFileSync(new URL('Mii.sav', this.saveUrl), toNxBytes(this.miiSav));
        Switch.writeFileSync(new URL('Player.sav', this.saveUrl), toNxBytes(this.playerSav));
        this.saveData.commit();
    }
}
