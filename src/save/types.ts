import type { CharInfoRaw } from '../mii/charinfo.ts';

export const TITLE_ID = 0x010051F0207B2000n;
export const MII_SLOT_COUNT = 70;
export const BACKUP_PARENT_DIR = 'sdmc:/switch/mii-sharing/';
export const BACKUP_DIR = `${BACKUP_PARENT_DIR}backups/`;
export const BACKUP_MAX = 15;

export type SaveDataHandle = NonNullable<ReturnType<typeof Switch.Application.prototype.findSaveData>>;

export interface MountResult {
    url: URL;
    saveData: SaveDataHandle;
}

export interface MiiEntry {
    slot: number;
    charInfo: CharInfoRaw;
    name: string;
    pronunciation: string;
    sexuality: [number, number, number];
    facepaintIndex: number;
    personality: number[];
}

export interface BackupEntry {
    index: number;
    timestamp?: string; // ISO 8601
    reason?: string;
}
