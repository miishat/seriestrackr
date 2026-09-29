import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ open, title, onClose, children, closable = true }: { open: boolean; title: string; onClose: () => void; children: ReactNode; closable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    opener.current = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => (dialog.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea') ?? dialog.querySelector<HTMLElement>('button'))?.focus());
    return () => {
      if (dialog.open) dialog.close();
      opener.current?.focus();
    };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-head"><h2>{title}</h2>{closable && <button type="button" onClick={onClose} aria-label={`Close ${title}`}>Close</button>}</div>
    {children}
  </dialog>;
}
