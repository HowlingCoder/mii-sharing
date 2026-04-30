<script lang="ts">
    import { exportMii, importMii, importMiiBuffer } from './api.ts';

    const CORS_PROXY = 'https://cors-anywhere.hc-streaming.com';
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

    type TsPhase = 'input' | 'confirm';
    interface TsInfo { id: number; name: string; platform: string }
    interface TsModalState { phase: TsPhase; url: string; loading: boolean; error: string | null; info: TsInfo | null }

    let tsModal = $state<TsModalState | null>(null);

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

    function openTsModal() {
        tsModal = { phase: 'input', url: '', loading: false, error: null, info: null };
    }

    function parseTsId(rawUrl: string): number | null {
        const m = rawUrl.trim().match(/tomodachishare\.com\/mii\/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    async function checkTsUrl() {
        if (!tsModal) return;
        const id = parseTsId(tsModal.url);
        if (id === null) {
            tsModal.error = 'Invalid URL. Expected: https://tomodachishare.com/mii/12345';
            return;
        }
        tsModal.loading = true;
        tsModal.error = null;
        try {
            const res = await fetch(`${CORS_PROXY}/https://api.tomodachishare.com/api/mii/${id}/info`);
            if (!res.ok) throw new Error(`Mii not found (${res.status})`);
            const data = await res.json() as { id: number; name: string; platform: string; isFromSaveFile: boolean };
            if (!data.isFromSaveFile) throw new Error('This Mii has no downloadable .ltd file');
            tsModal.info = { id: data.id, name: data.name, platform: data.platform };
            tsModal.phase = 'confirm';
        } catch (e) {
            tsModal.error = e instanceof Error ? e.message : String(e);
        } finally {
            tsModal.loading = false;
        }
    }

    async function doTsImport() {
        if (!tsModal?.info) return;
        const { id, name } = tsModal.info;
        tsModal.loading = true;
        tsModal.error = null;
        try {
            const res = await fetch(`${CORS_PROXY}/https://api.tomodachishare.com/mii/${id}/download`);
            if (!res.ok) throw new Error(`Download failed (${res.status})`);
            const buf = await res.arrayBuffer();
            await importMiiBuffer(mii.slot, buf);
            tsModal = null;
            setStatus(`"${name}" imported into slot ${mii.slot}!`, true);
            onImported();
        } catch (e) {
            if (tsModal) {
                tsModal.error = e instanceof Error ? e.message : String(e);
                tsModal.loading = false;
            }
        }
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
                    onclick={openTsModal}
                    disabled={busy}
                    class="w-full py-4 rounded-xl bg-td-yellow text-sw-text font-bold text-base
                           hover:bg-td-yellow-dark active:scale-[0.98] transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <img src="https://tomodachishare.com/favicon.svg" class="w-5 h-5" alt="" />
                    Download from TomodachiShare
                </button>

                <div class="flex gap-3">
                    <button
                        onclick={doExport}
                        disabled={busy}
                        class="flex-1 py-4 rounded-xl border-2 border-td-yellow text-sw-text font-bold text-base
                               hover:bg-td-yellow-light active:scale-[0.98] transition-all
                               disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Icon name="download" width={18} height={18} />
                        Export .ltd
                    </button>

                    <label class="flex-1 {busy ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}">
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

            </div>
        </section>

    </div>
</div>

{#if modal}
    <Modal message={modal.message} confirmLabel="Replace" onConfirm={modal.onConfirm} onCancel={() => modal = null} />
{/if}

{#if tsModal}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
    >
        <div class="bg-sw-surface border border-sw-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">

            <div class="flex items-center gap-3 mb-5">
                <img src="https://tomodachishare.com/favicon.svg" class="w-7 h-7" alt="TomodachiShare" />
                <h2 class="text-base font-bold">Download from TomodachiShare</h2>
            </div>

            {#if tsModal.phase === 'input'}
                <p class="text-sm text-sw-text-muted mb-3">Paste a TomodachiShare Mii link:</p>
                <input
                    type="url"
                    bind:value={tsModal.url}
                    placeholder="https://tomodachishare.com/mii/51259"
                    class="w-full px-3 py-2.5 rounded-lg bg-sw-bg border border-sw-border text-sw-text text-sm
                           focus:outline-none focus:border-td-yellow mb-3"
                    onkeydown={(e) => { if (e.key === 'Enter') checkTsUrl(); }}
                    disabled={tsModal.loading}
                />
                {#if tsModal.error}
                    <p class="text-red-500 text-xs mb-3">{tsModal.error}</p>
                {/if}
                <div class="flex gap-3 justify-end">
                    <button
                        onclick={() => { tsModal = null; }}
                        disabled={tsModal.loading}
                        class="px-4 py-2 rounded-lg border border-sw-border text-sw-text-muted text-sm
                               hover:border-td-yellow hover:text-sw-text transition-colors disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onclick={checkTsUrl}
                        disabled={tsModal.loading || !tsModal.url.trim()}
                        class="px-4 py-2 rounded-lg bg-td-yellow text-sw-text text-sm font-semibold
                               hover:bg-td-yellow-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {tsModal.loading ? 'Checking…' : 'Check'}
                    </button>
                </div>

            {:else}
                <div class="bg-sw-bg border border-sw-border rounded-lg px-4 py-3 mb-4">
                    <div class="font-semibold text-sm">{tsModal.info!.name}</div>
                    <div class="text-sw-text-muted text-xs mt-0.5">{tsModal.info!.platform} · #{tsModal.info!.id}</div>
                </div>
                <p class="text-sm text-sw-text-muted mb-4">
                    Import into slot <strong class="text-sw-text">{mii.slot}</strong> ({mii.name || 'No name'})?
                </p>
                {#if tsModal.error}
                    <p class="text-red-500 text-xs mb-3">{tsModal.error}</p>
                {/if}
                <div class="flex gap-3 justify-end">
                    <button
                        onclick={() => { tsModal = null; }}
                        disabled={tsModal.loading}
                        class="px-4 py-2 rounded-lg border border-sw-border text-sw-text-muted text-sm
                               hover:border-td-yellow hover:text-sw-text transition-colors disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onclick={doTsImport}
                        disabled={tsModal.loading}
                        class="px-4 py-2 rounded-lg bg-td-yellow text-sw-text text-sm font-semibold
                               hover:bg-td-yellow-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {tsModal.loading ? 'Importing…' : 'Import'}
                    </button>
                </div>
            {/if}

        </div>
    </div>
{/if}
