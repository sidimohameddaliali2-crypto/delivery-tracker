import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';

const ZoneColorManager = ({ isOpen, onClose, zones }) => {
  const [zoneColors, setZoneColors] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load saved zone colors from localStorage
  useEffect(() => {
    if (isOpen && zones.length > 0) {
      const savedColors = localStorage.getItem('zoneColors');
      const colorMap = savedColors ? JSON.parse(savedColors) : {};
      
      // Initialize colors for all zones (including new ones)
      const initialColors = {};
      zones.forEach(zone => {
        initialColors[zone] = colorMap[zone] || generateZoneColor(zone);
      });
      
      setZoneColors(initialColors);
      setHasChanges(false);
    }
  }, [isOpen, zones]);

  // Generate a deterministic color for a zone
  const generateZoneColor = (zoneName) => {
    const str = zoneName.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    
    const hue = hash % 360;
    const sat = 65;
    const light = 55;
    
    return hslToHex(hue, sat, light);
  };

  const hslToHex = (h, s, l) => {
    const sat = s / 100;
    const light = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
  };

  const handleColorChange = (zone, newColor) => {
    setZoneColors(prev => ({
      ...prev,
      [zone]: newColor
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem('zoneColors', JSON.stringify(zoneColors));
    setHasChanges(false);
    // Trigger a custom event to notify other components
    window.dispatchEvent(new CustomEvent('zoneColorsUpdated', { detail: zoneColors }));
    alert('Zone colors saved successfully!');
  };

  const handleReset = (zone) => {
    const defaultColor = generateZoneColor(zone);
    handleColorChange(zone, defaultColor);
  };

  const handleResetAll = () => {
    if (window.confirm('Are you sure you want to reset all zone colors to default?')) {
      const resetColors = {};
      zones.forEach(zone => {
        resetColors[zone] = generateZoneColor(zone);
      });
      setZoneColors(resetColors);
      setHasChanges(true);
    }
  };

  const getContrastColor = (hex) => {
    const sanitized = hex.replace('#', '');
    const r = parseInt(sanitized.slice(0, 2), 16) || 0;
    const g = parseInt(sanitized.slice(2, 4), 16) || 0;
    const b = parseInt(sanitized.slice(4, 6), 16) || 0;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Zone Color Management</h2>
            <p className="text-sm text-gray-600 mt-1">
              Customize colors for {zones.length} zones
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zones.map(zone => (
              <div
                key={zone}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900 flex-1">{zone}</h3>
                  <button
                    onClick={() => handleReset(zone)}
                    className="text-gray-400 hover:text-gray-600 transition"
                    title="Reset to default color"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/* Color Preview */}
                  <div
                    className="w-20 h-20 rounded-lg border-2 border-gray-200 flex items-center justify-center font-semibold text-sm"
                    style={{
                      backgroundColor: zoneColors[zone] || '#6B7280',
                      color: getContrastColor(zoneColors[zone] || '#6B7280')
                    }}
                  >
                    {zone.substring(0, 2).toUpperCase()}
                  </div>

                  {/* Color Input */}
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={zoneColors[zone] || '#6B7280'}
                        onChange={(e) => handleColorChange(zone, e.target.value)}
                        className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={zoneColors[zone] || '#6B7280'}
                        onChange={(e) => handleColorChange(zone, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {zones.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No zones found in current deliveries</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleResetAll}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reset All
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`px-6 py-2 rounded-lg transition flex items-center gap-2 ${
                hasChanges
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZoneColorManager;
