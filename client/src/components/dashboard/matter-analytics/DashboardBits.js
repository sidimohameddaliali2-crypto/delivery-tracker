import React, { useEffect, useRef, useState } from 'react';

// Small "i" next to a card title; the description is exposed as a tooltip and to screen readers.
export function InfoTip({ text }) {
  return <span className="mo-info-icon" role="img" aria-label={text} title={text}>i</span>;
}

// "···" menu in a card's top-right corner.
export function CardMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="mo-card-menu" ref={ref}>
      <button type="button" className="mo-menu-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>···</button>
      {open && (
        <div className="mo-menu-list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
