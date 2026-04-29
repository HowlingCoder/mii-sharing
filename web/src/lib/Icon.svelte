<script lang="ts">
    export type IconName =
        | 'chevron-left'
        | 'download'
        | 'refresh'
        | 'restore'
        | 'settings'
        | 'spinner'
        | 'trash'
        | 'upload';

    let {
        name,
        width = 16,
        height = 16,
        class: className = '',
    }: {
        name: IconName;
        width?: number;
        height?: number;
        class?: string;
    } = $props();
</script>

<svg
    {width}
    {height}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
>
    {#if name === 'chevron-left'}
        <polyline stroke-width="2.5" points="15 18 9 12 15 6" />
    {:else if name === 'download'}
        <path stroke-width="2.5" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline stroke-width="2.5" points="7 10 12 15 17 10" />
        <line stroke-width="2.5" x1="12" y1="15" x2="12" y2="3" />
    {:else if name === 'refresh'}
        <polyline stroke-width="2.5" points="23 4 23 10 17 10" />
        <path stroke-width="2.5" d="M20.49 15a9 9 0 1 1-.49-3.51" />
    {:else if name === 'restore'}
        <polyline stroke-width="1.5" points="1 4 1 10 7 10" />
        <path stroke-width="1.5" d="M3.51 15a9 9 0 1 0 .49-3.51" />
    {:else if name === 'settings'}
        <circle stroke-width="2" cx="12" cy="12" r="3" />
        <path stroke-width="2" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    {:else if name === 'spinner'}
        <circle cx="12" cy="12" r="10" stroke-width="3" stroke-dasharray="32" stroke-dashoffset="12" />
    {:else if name === 'trash'}
        <polyline stroke-width="2.5" points="3 6 5 6 21 6" />
        <path stroke-width="2.5" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path stroke-width="2.5" d="M10 11v6M14 11v6" />
        <path stroke-width="2.5" d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    {:else if name === 'upload'}
        <path stroke-width="2.5" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline stroke-width="2.5" points="7 10 12 5 17 10" />
        <line stroke-width="2.5" x1="12" y1="3" x2="12" y2="15" />
    {/if}
</svg>
