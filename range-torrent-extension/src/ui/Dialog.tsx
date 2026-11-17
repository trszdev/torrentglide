import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
export function Dialog({ open, onClose, labelledBy, class: className = '', keep = false, children, }: {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    class?: string;
    keep?: boolean;
    children: ComponentChildren;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const opened = useRef(false);
    if (open)
        opened.current = true;
    useLayoutEffect(() => {
        const dialog = ref.current;
        if (!dialog)
            return;
        if (open && !dialog.open)
            dialog.showModal();
        else if (!open && dialog.open)
            dialog.close();
    }, [open]);
    return (<dialog ref={ref} class={`rp-dialog ${className}`} aria-labelledby={labelledBy} onClose={onClose}>
      {open || (keep && opened.current) ? children : null}
    </dialog>);
}
