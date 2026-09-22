// Sentence-cases display text: only the first letter of the first word is
// capitalized, everything else is lowercased — independent of how the text
// was actually typed/stored (e.g. a menu title typed in all caps).
export const toSentenceCase = (text) => {
  const str = String(text || '');
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};
