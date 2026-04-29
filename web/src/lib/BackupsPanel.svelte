<script lang="ts">
    import { fetchBackups, deleteBackup, restoreBackup, downloadBackup } from './api.ts';
    import type { Backup, Status } from './types.ts';
    import Icon from './Icon.svelte';
    import Modal from './Modal.svelte';

    let { onRestored }: { onRestored: () => Promise<void> } = $props();

    let backups = $state<Backup[]>([]);
    let busy    = $state(false);
    let status  = $state<Status | null>(null);
    let modal   = $state<{ message: string; confirmLabel: string; onConfirm: () => void } | null>(null);

    async function load() {
        backups = await fetchBackups().catch(() => []);
    }

    function setStatus(msg: string, ok: boolean) {
        status = { msg, ok };
        setTimeout(() => (status = null), 4000);
    }

    function reasonLabel(reason: string): string {
        if (reason === 'pre-import')  return 'Before import';
        if (reason === 'pre-restore') return 'Before restore';
        return reason;
    }

    function doDelete(index: number) {
        modal = {
            message: `Delete backup ${index}? This cannot be undone.`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                modal = null;
                busy = true;
                try {
                    await deleteBackup(index);
                    setStatus(`Backup ${index} deleted.`, true);
                    await load();
                } catch (e) {
                    setStatus(String(e), false);
                } finally {
                    busy = false;
                }
            },
        };
    }

    function doRestore(index: number) {
        modal = {
            message: `Restore backup ${index}? A safety backup is created first.`,
            confirmLabel: 'Restore',
            onConfirm: async () => {
                modal = null;
                busy = true;
                try {
                    await restoreBackup(index);
                    setStatus(`Backup ${index} restored.`, true);
                    await onRestored();
                    await load();
                } catch (e) {
                    setStatus(String(e), false);
                } finally {
                    busy = false;
                }
            },
        };
    }

    $effect(() => { load(); });
</script>

<div class="flex flex-col h-full overflow-hidden">
    <div class="px-4 md:px-8 py-5 border-b border-sw-divider">
        <h2 class="text-lg font-semibold">Save Backups</h2>
        <p class="text-sm text-sw-text-muted mt-0.5">
            Up to 15 rotating backups. Created automatically before every import or restore.
        </p>
    </div>

    {#if status}
        <div class="mx-4 md:mx-8 mt-4 px-4 py-2.5 rounded-lg text-sm font-medium
            {status.ok
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'}">
            {status.msg}
        </div>
    {/if}

    <div class="flex-1 overflow-y-auto px-4 md:px-8 py-5">
        {#if backups.length === 0}
            <div class="flex flex-col items-center justify-center h-40 text-sw-text-muted gap-3">
                <Icon name="restore" width={40} height={40} />
                <span class="text-sm">No backups yet. Import a .ltd to create the first one.</span>
            </div>
        {:else}
            <div class="flex flex-col gap-3">
                {#each backups as backup}
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 rounded-xl border border-sw-border bg-sw-bg gap-3">
                        <div>
                            <div class="font-medium text-sm flex items-center gap-2">
                                Backup {backup.index}
                                {#if backup.reason}
                                    <span class="text-xs font-normal px-1.5 py-0.5 rounded bg-sw-surface border border-sw-border text-sw-text-muted">
                                        {reasonLabel(backup.reason)}
                                    </span>
                                {/if}
                            </div>
                            <div class="text-xs text-sw-text-muted mt-0.5">
                                {backup.timestamp
                                    ? new Date(backup.timestamp).toLocaleString()
                                    : 'Unknown time'}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button
                                onclick={() => downloadBackup(backup.index)}
                                disabled={busy}
                                title="Download as .sav file"
                                class="px-3 py-2 rounded-lg border border-sw-border text-sw-text-muted text-sm
                                       hover:border-td-yellow hover:text-sw-text active:scale-[0.98] transition-all
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Icon name="download" width={14} height={14} />
                            </button>
                            <button
                                onclick={() => doDelete(backup.index)}
                                disabled={busy}
                                title="Delete backup"
                                class="px-3 py-2 rounded-lg border border-sw-border text-red-400 text-sm
                                       hover:border-red-400 hover:bg-red-50 active:scale-[0.98] transition-all
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Icon name="trash" width={14} height={14} />
                            </button>
                            <button
                                onclick={() => doRestore(backup.index)}
                                disabled={busy}
                                class="px-4 py-2 rounded-lg bg-td-yellow text-sw-text text-sm font-semibold
                                       hover:bg-td-yellow-dark active:scale-[0.98] transition-all
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Restore
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>

{#if modal}
    <Modal message={modal.message} confirmLabel={modal.confirmLabel} onConfirm={modal.onConfirm} onCancel={() => modal = null} />
{/if}
