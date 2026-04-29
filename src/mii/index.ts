export type { CharInfoRaw } from './charinfo.ts';
export { CHAR_INFO_RAW_SIZE, charInfoGender, readUtf16LE, isEmptySlot } from './charinfo.ts';
export type { LtdFile } from './ltd.ts';
export { parseLtd, serializeLtd, LTD_VERSION, PERSONALITY_COUNT } from './ltd.ts';

export interface MiiSummary {
    slot: number;
    name: string;
    pronunciation: string;
    gender: number;
}
