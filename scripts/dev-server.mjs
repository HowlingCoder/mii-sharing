/**
 * Local dev server for mii-sharing.
 * Reads/writes a Mii.sav from the path given by MII_SAV_PATH env var.
 * Run with: MII_SAV_PATH=./testdata/Mii.sav node scripts/dev-server.mjs
 * Then start the Vite dev server: pnpm web:dev
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { deflateSync } from 'zlib';

const MII_SAV_PATH = process.env.MII_SAV_PATH;
if (!MII_SAV_PATH) {
    console.error('Error: MII_SAV_PATH environment variable is required.');
    console.error('Example: MII_SAV_PATH=./testdata/Mii.sav node scripts/dev-server.mjs');
    console.error('For Switch, set API_URL in the web config and skip this server.');
    process.exit(1);
}
const UGC_DIR = process.env.UGC_DIR ?? join(dirname(MII_SAV_PATH), 'Ugc');
const BACKUP_DIR = join(dirname(MII_SAV_PATH), 'backups');
const PORT = parseInt(process.env.PORT ?? '8080', 10);

// ─── Pure parsing logic (mirrored from src/mii.ts + src/save.ts) ────────────

const CHAR_INFO_RAW_SIZE = 156;

function readUtf16LE(buf, offset, maxChars) {
    const view = new DataView(buf.buffer, buf.byteOffset + offset);
    let str = '';
    for (let i = 0; i < maxChars; i++) {
        const code = view.getUint16(i * 2, true);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}

function writeUtf16LE(buf, offset, maxChars, str) {
    const view = new DataView(buf.buffer, buf.byteOffset + offset);
    const len = Math.min(str.length, maxChars - 1);
    for (let i = 0; i < len; i++) {
        view.setUint16(i * 2, str.charCodeAt(i), true);
    }
    if (len < maxChars) view.setUint16(len * 2, 0, true);
}

function parseCharInfoRaw(buf) {
    return {
        createId:        buf.slice(0x00, 0x10),
        nickname:        readUtf16LE(buf, 0x10, 10),
        fontRegion:      buf[0x26],
        favoriteColor:   buf[0x27],
        gender:          buf[0x28],
        height:          buf[0x29],
        build:           buf[0x2A],
        miiType:         buf[0x2B],
        regionMove:      buf[0x2C],
        facelineType:    buf[0x2D],
        facelineColor:   buf[0x2E],
        facelineWrinkle: buf[0x2F],
        facelineMake:    buf[0x30],
        hairType:        buf[0x31],
        hairColor:       buf[0x32],
        isHairFlip:      buf[0x33],
        eyeType:         buf[0x34],
        eyeColor:        buf[0x35],
        eyeScale:        buf[0x36],
        eyeAspect:       buf[0x37],
        eyeRotate:       buf[0x38],
        eyeX:            buf[0x39],
        eyeY:            buf[0x3A],
        eyebrowType:     buf[0x3B],
        eyebrowColor:    buf[0x3C],
        eyebrowScale:    buf[0x3D],
        eyebrowAspect:   buf[0x3E],
        eyebrowRotate:   buf[0x3F],
        eyebrowX:        buf[0x40],
        eyebrowY:        buf[0x41],
        noseType:        buf[0x42],
        noseScale:       buf[0x43],
        noseY:           buf[0x44],
        mouthType:       buf[0x45],
        mouthColor:      buf[0x46],
        mouthScale:      buf[0x47],
        mouthAspect:     buf[0x48],
        mouthY:          buf[0x49],
        beardColor:      buf[0x4A],
        beardType:       buf[0x4B],
        mustacheType:    buf[0x4C],
        mustacheScale:   buf[0x4D],
        mustacheY:       buf[0x4E],
        glassType:       buf[0x4F],
        glassColor:      buf[0x50],
        glassScale:      buf[0x51],
        glassY:          buf[0x52],
        hasMole:         buf[0x53],
        moleScale:       buf[0x54],
        moleX:           buf[0x55],
        moleY:           buf[0x56],
        padding:         buf[0x57],
        // Extended Tomodachi-specific fields
        extSkinColor:    buf[0x80] ?? 0,
        extHairColor:    buf[0x82] ?? 0,
    };
}

function serializeCharInfoRaw(mii) {
    const buf = new Uint8Array(CHAR_INFO_RAW_SIZE);
    buf.set(mii.createId.slice(0, 16), 0x00);
    writeUtf16LE(buf, 0x10, 10, mii.nickname);
    buf[0x26] = mii.fontRegion;
    buf[0x27] = mii.favoriteColor;
    buf[0x28] = mii.gender;
    buf[0x29] = mii.height;
    buf[0x2A] = mii.build;
    buf[0x2B] = mii.miiType;
    buf[0x2C] = mii.regionMove;
    buf[0x2D] = mii.facelineType;
    buf[0x2E] = mii.facelineColor;
    buf[0x2F] = mii.facelineWrinkle;
    buf[0x30] = mii.facelineMake;
    buf[0x31] = mii.hairType;
    buf[0x32] = mii.hairColor;
    buf[0x33] = mii.isHairFlip;
    buf[0x34] = mii.eyeType;
    buf[0x35] = mii.eyeColor;
    buf[0x36] = mii.eyeScale;
    buf[0x37] = mii.eyeAspect;
    buf[0x38] = mii.eyeRotate;
    buf[0x39] = mii.eyeX;
    buf[0x3A] = mii.eyeY;
    buf[0x3B] = mii.eyebrowType;
    buf[0x3C] = mii.eyebrowColor;
    buf[0x3D] = mii.eyebrowScale;
    buf[0x3E] = mii.eyebrowAspect;
    buf[0x3F] = mii.eyebrowRotate;
    buf[0x40] = mii.eyebrowX;
    buf[0x41] = mii.eyebrowY;
    buf[0x42] = mii.noseType;
    buf[0x43] = mii.noseScale;
    buf[0x44] = mii.noseY;
    buf[0x45] = mii.mouthType;
    buf[0x46] = mii.mouthColor;
    buf[0x47] = mii.mouthScale;
    buf[0x48] = mii.mouthAspect;
    buf[0x49] = mii.mouthY;
    buf[0x4A] = mii.beardColor;
    buf[0x4B] = mii.beardType;
    buf[0x4C] = mii.mustacheType;
    buf[0x4D] = mii.mustacheScale;
    buf[0x4E] = mii.mustacheY;
    buf[0x4F] = mii.glassType;
    buf[0x50] = mii.glassColor;
    buf[0x51] = mii.glassScale;
    buf[0x52] = mii.glassY;
    buf[0x53] = mii.hasMole;
    buf[0x54] = mii.moleScale;
    buf[0x55] = mii.moleX;
    buf[0x56] = mii.moleY;
    buf[0x57] = mii.padding;
    return buf;
}

function isEmptySlot(raw) {
    return raw.reduce((a, b) => a + b, 0) === 152;
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function findBytes(data, needle) {
    outer: for (let i = 0; i <= data.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (data[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function offsetLocator(data, hashHex) {
    const hash = hexToBytes(hashHex).reverse();
    const idx = findBytes(data, hash);
    if (idx === -1) return -1;
    const offset = new DataView(data.buffer, data.byteOffset).getUint32(idx + 4, true);
    return offset + 4;
}

function readSexuality(bitfield, slot) {
    const bitStart = slot * 3;
    return [0, 1, 2].map(i => {
        const bitIdx = bitStart + i;
        return (bitfield[Math.floor(bitIdx / 8)] >> (bitIdx % 8)) & 1;
    });
}

function writeSexuality(bitfield, slot, bits) {
    const bitStart = slot * 3;
    bits.forEach((bit, i) => {
        const bitIdx = bitStart + i;
        const byteIdx = Math.floor(bitIdx / 8);
        const bitPos = bitIdx % 8;
        bitfield[byteIdx] = bit
            ? bitfield[byteIdx] | (1 << bitPos)
            : bitfield[byteIdx] & ~(1 << bitPos);
    });
}

const MII_HASHES = {
    rawData:   '881CA27A',
    names:     '2499BFDA',
    pronoun:   '3A5EDA05',
    sexuality: 'DFC82223',
    facepaint: '5E32ADF4',
};

const PERSONALITY_HASHES = [
    '43CD364F','CD8DBAF8','25B48224','607BA160','68E1134E',
    '4913AE1A','141EE086','07B9D175','81CF470A','4D78E262',
    'FBC3FFB0','236E2D73','F3C3DE59','660C5247','5D7D3F45',
    'AB8AE08B','2545E583','6CF484F4',
];

const MII_SLOT_COUNT = 70;

function resolveOffsets(data) {
    return {
        rawData:     offsetLocator(data, MII_HASHES.rawData),
        names:       offsetLocator(data, MII_HASHES.names),
        pronoun:     offsetLocator(data, MII_HASHES.pronoun),
        sexuality:   offsetLocator(data, MII_HASHES.sexuality),
        facepaint:   offsetLocator(data, MII_HASHES.facepaint),
        personality: PERSONALITY_HASHES.map(h => offsetLocator(data, h)),
    };
}

function readAllMiis(miiSav) {
    const off = resolveOffsets(miiSav);
    const sexualityBuf = miiSav.slice(off.sexuality, off.sexuality + 27);
    const entries = [];

    for (let slot = 0; slot < MII_SLOT_COUNT; slot++) {
        const rawBuf = miiSav.slice(
            off.rawData + slot * CHAR_INFO_RAW_SIZE,
            off.rawData + (slot + 1) * CHAR_INFO_RAW_SIZE,
        );
        if (isEmptySlot(rawBuf)) continue;

        const personality = off.personality.map(pOff => {
            if (pOff === -1) return 0;
            return new DataView(miiSav.buffer, miiSav.byteOffset + pOff + slot * 4).getUint32(0, true);
        });

        entries.push({
            slot,
            charInfo:     parseCharInfoRaw(rawBuf),
            name:         readUtf16LE(miiSav, off.names + slot * 64, 32),
            pronunciation: readUtf16LE(miiSav, off.pronoun + slot * 128, 64),
            sexuality:    readSexuality(sexualityBuf, slot),
            facepaintIndex: miiSav[off.facepaint + slot * 4],
            personality,
        });
    }
    return entries;
}

// ─── .ltd parsing (mirrored from src/ltd.ts) ────────────────────────────────

const LTD_VERSION = 3;
const PERSONALITY_COUNT = 18;
const CANVAS_MAGIC = new Uint8Array([0xA3, 0xA3, 0xA3, 0xA3]);
const UGCTEX_MAGIC = new Uint8Array([0xA4, 0xA4, 0xA4, 0xA4]);

function readUtf16LEFixed(buf, offset, byteLen) {
    const view = new DataView(buf.buffer, buf.byteOffset + offset);
    const maxChars = byteLen / 2;
    let str = '';
    for (let i = 0; i < maxChars; i++) {
        const code = view.getUint16(i * 2, true);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}

function writeUtf16LEFixed(dst, offset, byteLen, str) {
    const view = new DataView(dst.buffer, dst.byteOffset + offset);
    const maxChars = byteLen / 2;
    const len = Math.min(str.length, maxChars - 1);
    for (let i = 0; i < len; i++) {
        view.setUint16(i * 2, str.charCodeAt(i), true);
    }
}

function findBytesFrom(haystack, needle, from = 0) {
    outer: for (let i = from; i <= haystack.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function parseLtd(buf) {
    if (buf[0] !== LTD_VERSION) throw new Error(`Unsupported .ltd version: ${buf[0]}`);
    const hasCanvas = buf[1] === 1;
    const hasUgctex = buf[2] === 1;
    const charInfoBuf = buf.slice(4, 4 + CHAR_INFO_RAW_SIZE);
    const charInfo = parseCharInfoRaw(charInfoBuf);
    const personality = [];
    const pView = new DataView(buf.buffer, buf.byteOffset + 160);
    for (let i = 0; i < PERSONALITY_COUNT; i++) {
        personality.push(pView.getUint32(i * 4, true));
    }
    const name = readUtf16LEFixed(buf, 232, 64);
    const pronunciation = readUtf16LEFixed(buf, 296, 128);
    const sexByte = buf[424];
    const sexuality = [(sexByte >> 0) & 1, (sexByte >> 1) & 1, (sexByte >> 2) & 1];
    let canvas, ugctex;
    if (hasCanvas || hasUgctex) {
        const canvasIdx = findBytesFrom(buf, CANVAS_MAGIC, 428);
        const ugctexIdx = findBytesFrom(buf, UGCTEX_MAGIC, 428);
        if (hasCanvas && canvasIdx !== -1) {
            canvas = buf.slice(canvasIdx + 4, ugctexIdx !== -1 ? ugctexIdx : buf.length);
        }
        if (hasUgctex && ugctexIdx !== -1) ugctex = buf.slice(ugctexIdx + 4);
    }
    return { version: LTD_VERSION, charInfo, personality, name, pronunciation, sexuality, canvas, ugctex };
}

function serializeLtd(ltd) {
    const hasCanvas = ltd.canvas !== undefined ? 1 : 0;
    const hasUgctex = ltd.ugctex !== undefined ? 1 : 0;
    const charInfoBuf = serializeCharInfoRaw(ltd.charInfo);
    const fixedSize = 428;
    const blobSize =
        (hasCanvas ? 4 + (ltd.canvas?.length ?? 0) : 0) +
        (hasUgctex ? 4 + (ltd.ugctex?.length ?? 0) : 0);
    const buf = new Uint8Array(fixedSize + blobSize);
    buf[0] = LTD_VERSION; buf[1] = hasCanvas; buf[2] = hasUgctex; buf[3] = 0;
    buf.set(charInfoBuf, 4);
    const pView = new DataView(buf.buffer, 160);
    for (let i = 0; i < PERSONALITY_COUNT; i++) pView.setUint32(i * 4, ltd.personality[i] ?? 0, true);
    writeUtf16LEFixed(buf, 232, 64, ltd.name);
    writeUtf16LEFixed(buf, 296, 128, ltd.pronunciation);
    buf[424] = ((ltd.sexuality[0] & 1) << 0) | ((ltd.sexuality[1] & 1) << 1) | ((ltd.sexuality[2] & 1) << 2);
    let pos = fixedSize;
    if (hasCanvas && ltd.canvas) { buf.set(CANVAS_MAGIC, pos); pos += 4; buf.set(ltd.canvas, pos); pos += ltd.canvas.length; }
    if (hasUgctex && ltd.ugctex) { buf.set(UGCTEX_MAGIC, pos); pos += 4; buf.set(ltd.ugctex, pos); }
    return buf;
}

// ─── charInfoRaw → hex helper ────────────────────────────────────────────────

function bufToHex(buf) {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function miiToJson(m) {
    return {
        slot: m.slot,
        name: m.name,
        pronunciation: m.pronunciation,
        sexuality: m.sexuality,
        facepaintIndex: m.facepaintIndex,
        personality: m.personality,
        charInfoHex: bufToHex(serializeCharInfoRaw(m.charInfo)),
        charInfo: {
            nickname:        m.charInfo.nickname,
            gender:          m.charInfo.gender,
            height:          m.charInfo.height,
            build:           m.charInfo.build,
            favoriteColor:   m.charInfo.favoriteColor,
            facelineType:    m.charInfo.facelineType,
            facelineColor:   m.charInfo.facelineColor,
            facelineMake:    m.charInfo.facelineMake,
            facelineWrinkle: m.charInfo.facelineWrinkle,
            hairType:        m.charInfo.hairType,
            hairColor:       m.charInfo.hairColor,
            isHairFlip:      m.charInfo.isHairFlip,
            eyeType:         m.charInfo.eyeType,
            eyeColor:        m.charInfo.eyeColor,
            eyeScale:        m.charInfo.eyeScale,
            eyeAspect:       m.charInfo.eyeAspect,
            eyeRotate:       m.charInfo.eyeRotate,
            eyeX:            m.charInfo.eyeX,
            eyeY:            m.charInfo.eyeY,
            eyebrowType:     m.charInfo.eyebrowType,
            eyebrowColor:    m.charInfo.eyebrowColor,
            eyebrowScale:    m.charInfo.eyebrowScale,
            eyebrowRotate:   m.charInfo.eyebrowRotate,
            eyebrowX:        m.charInfo.eyebrowX,
            eyebrowY:        m.charInfo.eyebrowY,
            noseType:        m.charInfo.noseType,
            noseScale:       m.charInfo.noseScale,
            noseY:           m.charInfo.noseY,
            mouthType:       m.charInfo.mouthType,
            mouthColor:      m.charInfo.mouthColor,
            mouthScale:      m.charInfo.mouthScale,
            mouthAspect:     m.charInfo.mouthAspect,
            mouthY:          m.charInfo.mouthY,
            beardType:       m.charInfo.beardType,
            mustacheType:    m.charInfo.mustacheType,
            glassType:       m.charInfo.glassType,
            glassColor:      m.charInfo.glassColor,
            hasMole:         m.charInfo.hasMole,
            extSkinColor:    m.charInfo.extSkinColor,
            extHairColor:    m.charInfo.extHairColor,
        },
    };
}

// ─── Facepaint canvas decoder ────────────────────────────────────────────────

/**
 * NSW block-linear deswizzle — ported from farbensplasch/tomodachi-texture-tool
 * (swizzle.py, MIT License). Handles canvas files: 256×256 RGBA8, swizzle_mode=4.
 */
function nswDeswizzle(data, imWidth, imHeight, blockW, blockH, bpb, swizzleMode) {
    const READ = 16;
    const readPerTile = 32 * (1 << swizzleMode);
    const tileDataSize = 512 * (1 << swizzleMode);
    const tileWidth = Math.floor(64 / bpb) * blockW;
    const tileHeight = 8 * blockH * (1 << swizzleMode);
    const tileCount = data.length / tileDataSize;
    const tilePerWidth = Math.floor(imWidth / tileWidth);
    const ops = [[2,0],[2,1],[4,0],[2,1],[1<<swizzleMode,0]];

    let di = 0;

    function concat(grids, axis) {
        if (axis === 0) {
            const r = []; for (const g of grids) for (const row of g) r.push(row); return r;
        } else {
            const rows = grids[0].length, r = [];
            for (let y = 0; y < rows; y++) {
                const row = []; for (const g of grids) for (const c of g[y]) row.push(c);
                r.push(row);
            }
            return r;
        }
    }

    function readTile() {
        let parts = [];
        for (let i = 0; i < readPerTile; i++) { parts.push([[data.slice(di, di+READ)]]); di += READ; }
        for (const [n, axis] of ops) {
            const next = [];
            for (let i = 0; i < parts.length; i += n) next.push(concat(parts.slice(i, i+n), axis));
            parts = next;
        }
        return parts[0];
    }

    const tiles = Array.from({length: tileCount}, readTile);
    const tileRows = [];
    for (let i = 0; i < tiles.length; i += tilePerWidth) tileRows.push(concat(tiles.slice(i, i+tilePerWidth), 1));
    const grid = concat(tileRows, 0);

    const out = Buffer.alloc(data.length);
    let idx = 0;
    for (const row of grid) for (const cell of row) { cell.copy(out, idx); idx += cell.length; }
    return out;
}

// Minimal CRC32 for PNG
const _crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
    return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (~c) >>> 0; }
function pngChunk(type, data) {
    const t = Buffer.from(type); const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, t, data, crcBuf]);
}
function rgbaToPng(rgba, w, h) {
    const rows = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) { rows[y*(w*4+1)] = 0; rgba.copy(rows, y*(w*4+1)+1, y*w*4, (y+1)*w*4); }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8]=8; ihdr[9]=6;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR',ihdr), pngChunk('IDAT',deflateSync(rows)), pngChunk('IEND',Buffer.alloc(0))]);
}

function decodeFacepaintCanvas(index) {
    const id = String(index).padStart(3, '0');
    const path = join(UGC_DIR, `UgcFacePaint${id}.canvas.zs`);
    if (!existsSync(path)) return null;
    const raw = execFileSync('zstd', ['-d', '-c', path]);
    const deswizzled = nswDeswizzle(raw, 256, 256, 1, 1, 4, 4);
    return rgbaToPng(deswizzled, 256, 256);
}

// ─── Backup logic ─────────────────────────────────────────────────────────────

const MAX_BACKUPS = 5;

function ensureBackupDir() {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupSave() {
    ensureBackupDir();
    for (let i = MAX_BACKUPS - 1; i >= 0; i--) {
        const from = join(BACKUP_DIR, `Mii.sav.${i}`);
        const to   = join(BACKUP_DIR, `Mii.sav.${i + 1}`);
        if (existsSync(from)) {
            if (i + 1 < MAX_BACKUPS) copyFileSync(from, to);
        }
    }
    copyFileSync(MII_SAV_PATH, join(BACKUP_DIR, 'Mii.sav.0'));
}

function listBackups() {
    ensureBackupDir();
    const backups = [];
    for (let i = 0; i < MAX_BACKUPS; i++) {
        const p = join(BACKUP_DIR, `Mii.sav.${i}`);
        if (existsSync(p)) {
            const stat = statSync(p);
            backups.push({ index: i, size: stat.size, mtime: stat.mtime.toISOString() });
        }
    }
    return backups;
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResp(data, status = 200) {
    return { status, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) };
}

function errResp(msg, status = 400) {
    return jsonResp({ error: msg }, status);
}

const eventLog = [];
function logEvent(msg) {
    const entry = { time: new Date().toISOString(), msg };
    eventLog.unshift(entry);
    if (eventLog.length > 50) eventLog.pop();
    console.log(`[${entry.time}] ${msg}`);
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }

    function send(resp) {
        res.writeHead(resp.status, resp.headers);
        if (resp.buffer) res.end(Buffer.from(resp.buffer));
        else res.end(resp.body ?? '');
    }

    if (method === 'GET' && path === '/miis') {
        try {
            const miiSav = new Uint8Array(readFileSync(MII_SAV_PATH));
            const miis = readAllMiis(miiSav);
            send(jsonResp(miis.map(miiToJson)));
        } catch (e) {
            send(errResp(String(e), 500));
        }
        return;
    }

    const slotMatch = path.match(/^\/mii\/(\d+)$/);
    if (slotMatch) {
        const slot = parseInt(slotMatch[1], 10);
        if (isNaN(slot) || slot < 0 || slot > 69) { send(errResp('Invalid slot')); return; }

        if (method === 'GET') {
            try {
                const miiSav = new Uint8Array(readFileSync(MII_SAV_PATH));
                const off = resolveOffsets(miiSav);
                const rawBuf = miiSav.slice(off.rawData + slot * CHAR_INFO_RAW_SIZE, off.rawData + (slot + 1) * CHAR_INFO_RAW_SIZE);
                if (isEmptySlot(rawBuf)) { send(errResp('Slot is empty', 404)); return; }
                const sexualityBuf = miiSav.slice(off.sexuality, off.sexuality + 27);
                const personality = off.personality.map(pOff => {
                    if (pOff === -1) return 0;
                    return new DataView(miiSav.buffer, miiSav.byteOffset + pOff + slot * 4).getUint32(0, true);
                });
                const ltd = {
                    version: 3,
                    charInfo: parseCharInfoRaw(rawBuf),
                    personality,
                    name: readUtf16LE(miiSav, off.names + slot * 64, 32),
                    pronunciation: readUtf16LE(miiSav, off.pronoun + slot * 128, 64),
                    sexuality: readSexuality(sexualityBuf, slot),
                };
                const ltdBuf = serializeLtd(ltd);
                const name = readUtf16LE(miiSav, off.names + slot * 64, 32) || 'mii';
                logEvent(`Exported slot ${slot} (${name})`);
                res.writeHead(200, {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': `attachment; filename="mii_slot${slot}.ltd"`,
                    ...CORS,
                });
                res.end(Buffer.from(ltdBuf));
            } catch (e) {
                send(errResp(String(e), 404));
            }
            return;
        }

        if (method === 'POST') {
            try {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const body = Buffer.concat(chunks);
                if (!body.length) { send(errResp('Body is empty')); return; }

                const miiSav = new Uint8Array(readFileSync(MII_SAV_PATH));
                const ltd = parseLtd(new Uint8Array(body));
                const off = resolveOffsets(miiSav);
                const sexualityBuf = miiSav.slice(off.sexuality, off.sexuality + 27);

                backupSave();

                miiSav.set(serializeCharInfoRaw(ltd.charInfo), off.rawData + slot * CHAR_INFO_RAW_SIZE);
                const nameTarget = miiSav.slice(off.names + slot * 64, off.names + slot * 64 + 64);
                nameTarget.fill(0);
                writeUtf16LE(nameTarget, 0, 32, ltd.name);
                miiSav.set(nameTarget, off.names + slot * 64);
                const pronTarget = miiSav.slice(off.pronoun + slot * 128, off.pronoun + slot * 128 + 128);
                pronTarget.fill(0);
                writeUtf16LE(pronTarget, 0, 64, ltd.pronunciation);
                miiSav.set(pronTarget, off.pronoun + slot * 128);
                writeSexuality(sexualityBuf, slot, ltd.sexuality);
                miiSav.set(sexualityBuf, off.sexuality);
                ltd.personality.forEach((val, i) => {
                    const pOff = off.personality[i];
                    if (pOff === -1) return;
                    new DataView(miiSav.buffer, miiSav.byteOffset + pOff + slot * 4).setUint32(0, val, true);
                });
                miiSav[off.facepaint + slot * 4] = 0xFF; // no facepaint in local dev

                writeFileSync(MII_SAV_PATH, Buffer.from(miiSav));
                logEvent(`Imported .ltd into slot ${slot} (${ltd.name})`);
                send(jsonResp({ ok: true, slot }));
            } catch (e) {
                send(errResp(String(e), 500));
            }
            return;
        }
    }

    if (method === 'GET' && path === '/backups') {
        send(jsonResp(listBackups()));
        return;
    }

    const restoreMatch = path.match(/^\/backups\/restore\/(\d+)$/);
    if (restoreMatch && method === 'POST') {
        const idx = parseInt(restoreMatch[1], 10);
        const backupPath = join(BACKUP_DIR, `Mii.sav.${idx}`);
        if (!existsSync(backupPath)) { send(errResp('Backup not found', 404)); return; }
        backupSave();
        copyFileSync(backupPath, MII_SAV_PATH);
        logEvent(`Restored backup ${idx}`);
        send(jsonResp({ ok: true }));
        return;
    }

    if (method === 'GET' && path === '/log') {
        send(jsonResp(eventLog));
        return;
    }

    const facepaintMatch = path.match(/^\/facepaint\/(\d+)$/);
    if (facepaintMatch && method === 'GET') {
        const idx = parseInt(facepaintMatch[1], 10);
        try {
            const png = decodeFacepaintCanvas(idx);
            if (!png) { res.writeHead(404, CORS); res.end('Not Found'); return; }
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=60', ...CORS });
            res.end(png);
        } catch (e) {
            send(errResp(String(e), 500));
        }
        return;
    }

    res.writeHead(404, CORS);
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`[mii-sharing dev] API server running at http://localhost:${PORT}`);
    console.log(`[mii-sharing dev] Reading save from: ${MII_SAV_PATH}`);
    console.log(`[mii-sharing dev] Now run: pnpm web:dev`);
});
