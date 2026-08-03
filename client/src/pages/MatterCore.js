import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Copy, Check, ExternalLink } from 'lucide-react';
import api from '../utils/api';

const formatSize = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const MatterCore = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await api.get('/matter-core');
      setStatus(response.data.data);
    } catch (err) {
      setError('Unable to load Matter Core status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleFileSelect = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      return;
    }

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const response = await api.post('/matter-core/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStatus(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyLink = async () => {
    if (!status?.shareUrl) return;
    await navigator.clipboard.writeText(status.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Matter Core</h1>
        <p className="text-gray-600 mt-1">
          Upload the Matter Core menu PDF and share one link with customers. Uploading a new PDF replaces
          the current one — the link you've already shared keeps working.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : (
          <>
            {status?.shareUrl ? (
              <div className="mb-6">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{status.originalName || 'Matter Core menu.pdf'}</p>
                    <p className="text-xs text-gray-500">
                      {formatSize(status.size)}
                      {status.updatedAt && ` · Updated ${new Date(status.updatedAt).toLocaleString()}`}
                      {typeof status.viewCount === 'number' && ` · ${status.viewCount} view${status.viewCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={status.shareUrl}
                    className="flex-1 min-w-0 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition"
                  >
                    {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={status.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition"
                  >
                    <ExternalLink size={16} />
                    Open
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-6">No Matter Core PDF uploaded yet.</p>
            )}

            <label
              htmlFor="matter-core-upload"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition"
            >
              <Upload size={24} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {uploading ? 'Uploading...' : status?.shareUrl ? 'Upload a new PDF to replace it' : 'Click to upload a PDF'}
              </span>
              <span className="text-xs text-gray-400">PDF up to 20MB</span>
              <input
                id="matter-core-upload"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
};

export default MatterCore;
