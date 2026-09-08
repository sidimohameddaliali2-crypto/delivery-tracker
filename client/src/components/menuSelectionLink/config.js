// Which weekly menu(s) get the redesigned "Menu Selection Link" flow.
//
// Only the share token(s) listed here render the new design — every other
// menu-selection link keeps the current UI (MenuSelection.jsx). Leave this
// empty and no menu uses the redesign.
//
// Set it via env (comma-separated) or paste the test menu's share token into
// the fallback list below. The token is the ":token" part of the customer
// link, e.g. /menu-select/<token>.

const envTokens = String(process.env.REACT_APP_MENU_SELECTION_V2_TOKENS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const FALLBACK_TEST_TOKENS = [
  // Test weekly menu — this menu's customer link gets the redesigned flow.
  'ad62b805add187a175546239f1f9a06c8fb512bcbeb8a5b5eac0f4124fe93fab',
];

export const TEST_MENU_TOKENS = new Set([...envTokens, ...FALLBACK_TEST_TOKENS]);

export const isTestMenuToken = (token) => !!token && TEST_MENU_TOKENS.has(token);
