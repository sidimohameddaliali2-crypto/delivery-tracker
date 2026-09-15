import React from 'react';
import { useParams } from 'react-router-dom';
import MenuSelectionLink from '../components/menuSelectionLink/MenuSelectionLink';

// The redesigned flow is now live for every weekly menu's customer link.
// (It used to be gated to one test menu via config.js's token allowlist —
// that allowlist/isTestMenuToken is no longer consulted here. The old
// component, ../components/MenuSelection, is left in place, unreferenced,
// in case of a rollback.)
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

  return <MenuSelectionLink token={token} />;
};

export default MenuSelectPage;
