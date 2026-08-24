import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

function RowActionsMenu({ deliveryId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded transition-colors"
        title="Actions"
      >
        <span className="material-symbols-outlined text-[20px]">more_vert</span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[140px] py-1">
          <Link
            to={`/deliveries/${deliveryId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined text-[18px] text-gray-400">visibility</span>
            View
          </Link>
          <button
            type="button"
            title="Edit"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined text-[18px] text-gray-400">edit</span>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

export default RowActionsMenu;
