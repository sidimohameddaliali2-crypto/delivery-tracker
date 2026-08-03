import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import api from '../utils/api';

const MatterCorePdfPage = () => {
  const { token } = useParams();
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get(`/matter-core/share/${token}`);
        setPdf(response.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'This link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !pdf) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-600">{error || 'This link is invalid or has expired. Please contact support.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h1 className="text-white font-medium truncate">{pdf.originalName || 'Matter Core Menu'}</h1>
        <a
          href={pdf.fileUrl}
          download
          className="inline-flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 transition"
        >
          <Download size={16} />
          Download
        </a>
      </div>
      <iframe
        title="Matter Core Menu"
        src={pdf.fileUrl}
        className="flex-1 w-full border-0"
      />
    </div>
  );
};

export default MatterCorePdfPage;
