export interface Mii {
    slot: number;
    name: string;
    pronunciation: string;
    gender: number;
}

export interface Backup {
    index: number;
    timestamp?: string;
    reason?: string;
}

export interface LogEntry {
    time: string;
    msg: string;
}

export interface Status {
    msg: string;
    ok: boolean;
}

export interface ButtonHint {
    btn: 'A' | 'B' | 'X' | 'Y';
    label: string;
}

export const GENDER_LABELS = ['Male', 'Female', 'Non-binary'] as const;
