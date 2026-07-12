import React from 'react';
import { useParams } from 'react-router-dom';
import MenuSelection from '../components/MenuSelection';

const MenuSelectPage = () => {
  const { token } = useParams();

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-600">
            The menu selection link is invalid or has expired. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  return <MenuSelection token={token} />;
};

export default MenuSelectPage;
