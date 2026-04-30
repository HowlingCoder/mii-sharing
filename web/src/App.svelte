<script lang="ts">
    import { onMount } from 'svelte';
    import { fetchMiis } from './lib/api.ts';
    import type { Mii, ButtonHint } from './lib/types.ts';
    import MiiDetail from './lib/MiiDetail.svelte';
    import BackupsPanel from './lib/BackupsPanel.svelte';
    import SettingsPanel from './lib/SettingsPanel.svelte';
    import Footer from './lib/Footer.svelte';
    import Logo from './lib/Logo.svelte';
    import Icon from './lib/Icon.svelte';

    let miis     = $state<Mii[]>([]);
    let selected = $state<Mii | null>(null);
    let loading  = $state(true);
    let error    = $state<string | null>(null);

    let panel            = $state<'mii' | 'backups' | 'settings'>('mii');
    let mobileShowDetail = $state(false);
    const showSidebar    = $derived(panel === 'mii' && !mobileShowDetail);

    async function load() {
        loading = true; error = null;
        try {
            miis = await fetchMiis();
            if (selected) {
                selected = miis.find(m => m.slot === selected!.slot) ?? miis[0] ?? null;
            } else if (miis.length > 0) {
                selected = miis[0];
            }
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    onMount(load);

    function openPanel(p: typeof panel) {
        panel = p;
        mobileShowDetail = false;
    }

    const footerHints: ButtonHint[] = [
        { btn: 'A', label: 'Select' },
        { btn: 'B', label: 'Back' },
        { btn: 'X', label: 'Refresh' },
    ];
</script>

<div class="flex flex-col w-full h-full bg-sw-bg">

    <!-- Header -->
    <header class="bg-sw-surface border-b border-sw-border flex items-center px-4 md:px-6 gap-3 md:gap-4 shrink-0 py-3 md:h-[72px] md:py-0">
        <div class="w-8 h-8 shrink-0">
            <Logo />
        </div>

        <h1 class="text-lg font-semibold tracking-wide">Mii Sharing</h1>
        <span class="hidden sm:block text-sm text-sw-text-muted">Tomodachi Life: Living the Dream</span>

        <div class="ml-auto flex items-center gap-2">
            <button
                onclick={() => openPanel('backups')}
                class="px-3.5 py-1.5 rounded-lg border text-sm transition-colors flex items-center gap-1.5
                       {panel === 'backups'
                           ? 'bg-td-yellow border-td-yellow text-sw-text font-semibold'
                           : 'border-sw-border text-sw-text-muted hover:border-td-yellow hover:text-sw-text'}"
            >
                Backups
            </button>

            <button
                onclick={() => openPanel('settings')}
                class="px-2.5 py-1.5 rounded-lg border text-sm transition-colors
                       {panel === 'settings'
                           ? 'bg-td-yellow border-td-yellow text-sw-text'
                           : 'border-sw-border text-sw-text-muted hover:border-td-yellow hover:text-sw-text'}"
                aria-label="Settings"
            >
                <Icon name="settings" />
            </button>
        </div>
    </header>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">

        <!-- Sidebar -->
        <aside class="{showSidebar ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[300px] bg-sw-sidebar border-r border-sw-border overflow-hidden shrink-0">
            <div class="px-5 py-3 text-xs font-bold uppercase tracking-wider text-sw-text-muted border-b border-sw-divider">
                Miis ({miis.length})
            </div>

            <div class="flex-1 overflow-y-auto">
                {#if loading}
                    <div class="flex items-center justify-center h-32 text-sw-text-muted text-sm gap-2">
                        <Icon name="spinner" class="animate-spin w-4 h-4" />
                        Loading…
                    </div>
                {:else if error}
                    <div class="px-5 py-4 text-sm text-red-600">{error}</div>
                {:else if miis.length === 0}
                    <div class="flex items-center justify-center h-32 text-sw-text-muted text-sm">
                        No Miis found.
                    </div>
                {:else}
                    {#each miis as mii}
                        {@const isSelected = selected?.slot === mii.slot && panel === 'mii'}
                        <button
                            onclick={() => { selected = mii; panel = 'mii'; mobileShowDetail = true; }}
                            class="relative w-full text-left px-5 py-3 flex items-center gap-3
                                   border-b border-sw-divider transition-colors hover:bg-td-yellow-light
                                   {isSelected ? 'bg-td-yellow-light' : ''}"
                        >
                            <div class="absolute left-0 w-1 h-9 rounded-r-full transition-all
                                        {isSelected ? 'bg-td-yellow' : 'bg-transparent'}"></div>

                            <div class="w-9 h-9 rounded-xl bg-td-yellow-light border-2 border-td-yellow
                                        flex items-center justify-center text-sm font-bold shrink-0">
                                {mii.name?.[0] ?? '?'}
                            </div>

                            <div class="min-w-0">
                                <div class="font-medium text-sm truncate">{mii.name || 'No name'}</div>
                                <div class="text-xs text-sw-text-muted">Slot {mii.slot}</div>
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </aside>

        <!-- Main content -->
        <main class="{showSidebar ? 'hidden' : 'block'} md:block flex-1 bg-sw-surface overflow-hidden">
            {#if panel === 'mii'}
                {#if selected}
                    <MiiDetail mii={selected} onImported={load} onBack={() => { mobileShowDetail = false; }} />
                {:else}
                    <div class="flex items-center justify-center h-full text-sw-text-muted text-sm">
                        Select a Mii
                    </div>
                {/if}
            {:else if panel === 'backups'}
                <BackupsPanel onRestored={load} />
            {:else if panel === 'settings'}
                <SettingsPanel />
            {/if}
        </main>
    </div>

    <Footer hints={footerHints} />
</div>
