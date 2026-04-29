import { FsSaveDataType } from '@nx.js/constants';
import { TITLE_ID, type MountResult, type SaveDataHandle } from './types.ts';

type NxApplication = { id: bigint; findSaveData(pred: (s: SaveDataHandle) => boolean): SaveDataHandle | null };

export async function mountSave(): Promise<MountResult> {
    const user = Switch.Profile.current;
    if (!user) throw new Error('No active user profile');

    const app = (Switch.Application as unknown as { find(pred: (a: NxApplication) => boolean): NxApplication | null })
        .find((a: NxApplication) => a.id === TITLE_ID);
    if (!app) throw new Error('Tomodachi Life: Living the Dream is not installed');

    const saveData = app.findSaveData((s: SaveDataHandle) =>
        s.type === FsSaveDataType.Account &&
        s.uid[0] === user.uid[0] &&
        s.uid[1] === user.uid[1],
    );
    if (!saveData) throw new Error('No save data found for the current user');

    return { url: saveData.mount(), saveData };
}
