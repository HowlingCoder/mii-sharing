export type CharInfoRaw = Uint8Array;

export const CHAR_INFO_RAW_SIZE = 156;

export const charInfoGender = (raw: Uint8Array): number => raw[0x28];

export function readUtf16LE(buf: Uint8Array, offset: number, maxChars: number): string {
    const view = new DataView(buf.buffer, buf.byteOffset + offset);
    let str = '';
    for (let i = 0; i < maxChars; i++) {
        const code = view.getUint16(i * 2, true);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}

export function isEmptySlot(raw: Uint8Array): boolean {
    return raw.reduce((a, b) => a + b, 0) === 152;
}
