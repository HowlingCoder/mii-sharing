<script lang="ts">
    import { fetchLog } from './api.ts';
    import type { LogEntry } from './types.ts';
    import Icon from './Icon.svelte';

    let logEntries = $state<LogEntry[]>([]);

    async function load() {
        logEntries = await fetchLog().catch(() => []);
    }

    $effect(() => { load(); });
</script>

<div class="flex flex-col h-full overflow-hidden">
    <div class="px-4 md:px-8 py-5 border-b border-sw-divider">
        <h2 class="text-lg font-semibold">Settings</h2>
    </div>

    <div class="flex-1 overflow-y-auto px-4 md:px-8 py-5 flex flex-col gap-6">
        <section>
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-bold uppercase tracking-wider text-sw-text-muted">Activity Log</h3>
                <button onclick={load} class="text-xs text-sw-text-muted hover:text-sw-text transition-colors flex items-center gap-1">
                    <Icon name="refresh" width={11} height={11} />
                    Refresh
                </button>
            </div>
            <div class="rounded-xl border border-sw-border bg-sw-bg overflow-hidden">
                {#if logEntries.length === 0}
                    <div class="px-5 py-4 text-sm text-sw-text-muted">No activity yet.</div>
                {:else}
                    {#each logEntries as entry}
                        <div class="flex gap-4 px-5 py-2.5 border-b border-sw-divider/60 text-sm last:border-0">
                            <span class="text-sw-text-muted shrink-0 text-xs mt-0.5">
                                {new Date(entry.time).toLocaleTimeString()}
                            </span>
                            <span>{entry.msg}</span>
                        </div>
                    {/each}
                {/if}
            </div>
        </section>
    </div>
</div>
