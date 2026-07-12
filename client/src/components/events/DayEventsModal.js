import React, { useState } from 'react';
import EventDetailModal from './EventDetailModal';
import { motion, AnimatePresence } from 'framer-motion';

const DayEventsModal = ({ isOpen, events = [], onClose, onEventClick }) => {
  // local focus state no longer required; parent will show detail
  if (!isOpen) return null;

  const handleClick = (evt) => {
    if (onEventClick) onEventClick(evt);
  };

  const handleCloseDetail = () => {
    setFocusedEvent(null);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg max-w-md w-full max-h-full overflow-y-auto"
            >
              <div className="p-4">
                <h3 className="text-lg font-bold mb-3">Events on selected day</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-gray-600">No events</p>
                ) : (
                  <ul className="space-y-2">
                    {events.map((e) => (
                      <li key={e._id}>
                        <button
                          className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
                          onClick={() => handleClick(e)}
                        >
                          {e.eventName} ({e.companyName})
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
};

export default DayEventsModal;
