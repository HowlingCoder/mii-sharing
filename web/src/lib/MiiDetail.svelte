<script lang="ts">
    import { exportMii, importMii } from './api.ts';
    import { GENDER_LABELS, type Mii, type Status } from './types.ts';
    import { facepaintUrl } from './facepaint.ts';
    import Icon from './Icon.svelte';
    import Modal from './Modal.svelte';

    let { mii, onImported, onBack }: { mii: Mii; onImported: () => void; onBack?: () => void } = $props();

    let importFile: HTMLInputElement;
    let status = $state<Status | null>(null);
    let busy = $state(false);
    let facepaintLoaded = $state(false);
    let modal = $state<{ message: string; onConfirm: () => void } | null>(null);

    function setStatus(msg: string, ok: boolean) {
        status = { msg, ok };
        setTimeout(() => (status = null), 3500);
    }

    async function doExport() {
        busy = true;
        try {
            const blob = await exportMii(mii.slot);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${mii.name || 'mii'}_slot${mii.slot}.ltd`;
            a.click();
            setStatus(`Slot ${mii.slot} exported.`, true);
        } catch (e) {
            setStatus(String(e), false);
        } finally {
            busy = false;
        }
    }

    async function doImport(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        importFile.value = '';
        modal = {
            message: `Replace slot ${mii.slot} (${mii.name || 'No name'}) with "${file.name}"?`,
            onConfirm: async () => {
                modal = null;
                busy = true;
                try {
                    await importMii(mii.slot, file);
                    setStatus(`Mii imported into slot ${mii.slot}!`, true);
                    onImported();
                } catch (err) {
                    setStatus(String(err), false);
                } finally {
                    busy = false;
                }
            },
        };
    }

    const gender = $derived(GENDER_LABELS[mii.gender] ?? String(mii.gender));
    const fpUrl = $derived(facepaintUrl(mii.slot));

    $effect(() => {
        mii.slot; // track mii changes so facepaint resets when a different slot is selected
        facepaintLoaded = false;
    });
</script>

<div class="flex flex-col h-full overflow-hidden">

    <!-- Header -->
    <div class="px-4 md:px-8 py-4 md:py-5 border-b border-sw-divider flex items-center gap-3">
        {#if onBack}
            <button
                onclick={onBack}
                class="md:hidden p-2 rounded-lg border border-sw-border hover:border-td-yellow hover:bg-td-yellow-light transition-colors shrink-0"
                aria-label="Back"
            >
                <Icon name="chevron-left" width={20} height={20} />
            </button>
        {/if}

        <img
            src={fpUrl}
            alt="Facepaint"
            class="w-20 h-20 rounded-xl border-2 border-td-yellow object-cover shrink-0 {facepaintLoaded ? '' : 'hidden'}"
            onload={() => facepaintLoaded = true}
            onerror={() => facepaintLoaded = false}
        />
        {#if !facepaintLoaded}
            <div class="w-20 h-20 rounded-xl bg-td-yellow-light border-2 border-td-yellow
                        flex items-center justify-center text-2xl font-bold shrink-0">
                {mii.name?.[0] ?? '?'}
            </div>
        {/if}

        <div>
            <div class="text-xl font-semibold">{mii.name || 'No name'}</div>
            <div class="text-sm text-sw-text-muted">
                Slot {mii.slot}{mii.pronunciation ? ` · ${mii.pronunciation}` : ''}
            </div>
        </div>
    </div>

    {#if status}
        <div class="mx-4 md:mx-8 mt-4 px-4 py-2.5 rounded-lg text-sm font-medium
            {status.ok
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'}">
            {status.msg}
        </div>
    {/if}

    <div class="flex-1 overflow-y-auto px-4 md:px-8 py-5 flex flex-col gap-6">

        <section>
            <h3 class="text-xs font-bold uppercase tracking-wider text-sw-text-muted mb-3">Info</h3>
            <div class="grid grid-cols-2 gap-x-8 text-sm">
                {#each [
                    ['Gender',        gender],
                    ['Pronunciation', mii.pronunciation || '—'],
                ] as [label, value]}
                    <div class="flex justify-between py-1.5 border-b border-sw-divider/60">
                        <span class="text-sw-text-muted">{label}</span>
                        <span class="font-medium">{value}</span>
                    </div>
                {/each}
            </div>
        </section>

        {#if facepaintLoaded}
            <section>
                <h3 class="text-xs font-bold uppercase tracking-wider text-sw-text-muted mb-3">Facepaint</h3>
                <div class="flex justify-center">
                    <img
                        src={fpUrl}
                        alt="Facepaint"
                        class="w-40 h-40 rounded-lg border border-sw-divider bg-sw-surface"
                    />
                </div>
            </section>
        {/if}

        <section>
            <h3 class="text-xs font-bold uppercase tracking-wider text-sw-text-muted mb-3">Transfer</h3>
            <div class="flex flex-col gap-3">
                <button
                    onclick={doExport}
                    disabled={busy}
                    class="w-full py-4 rounded-xl bg-td-yellow text-sw-text font-bold text-base
                           hover:bg-td-yellow-dark active:scale-[0.98] transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <Icon name="download" width={18} height={18} />
                    Export as .ltd
                </button>

                <label class="w-full {busy ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">
                    <input
                        bind:this={importFile}
                        type="file"
                        accept=".ltd"
                        class="hidden"
                        onchange={doImport}
                        disabled={busy}
                    />
                    <span class="flex items-center justify-center gap-2 w-full py-4 rounded-xl
                                 border-2 border-td-yellow text-sw-text font-bold text-base
                                 hover:bg-td-yellow-light active:scale-[0.98] transition-all">
                        <Icon name="upload" width={18} height={18} />
                        Import .ltd
                    </span>
                </label>
            </div>
        </section>

    </div>
</div>

{#if modal}
    <Modal message={modal.message} confirmLabel="Replace" onConfirm={modal.onConfirm} onCancel={() => modal = null} />
{/if}
