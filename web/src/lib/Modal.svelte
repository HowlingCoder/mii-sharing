<script lang="ts">
    let { message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }: {
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        onConfirm: () => void;
        onCancel: () => void;
    } = $props();
</script>

<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
>
    <div class="bg-sw-surface border border-sw-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <p class="text-sm text-sw-text mb-6 leading-relaxed">{message}</p>
        <div class="flex gap-3 justify-end">
            <button
                onclick={onCancel}
                class="px-4 py-2 rounded-lg border border-sw-border text-sw-text-muted text-sm
                       hover:border-td-yellow hover:text-sw-text transition-colors"
            >
                {cancelLabel}
            </button>
            <button
                onclick={onConfirm}
                class="px-4 py-2 rounded-lg bg-td-yellow text-sw-text text-sm font-semibold
                       hover:bg-td-yellow-dark active:scale-[0.98] transition-all"
            >
                {confirmLabel}
            </button>
        </div>
    </div>
</div>
