// TextCache uses identifiers in R133; asset descriptions still use English.
export const legacyTextSource = source => ({
  'Assets/AssetStrings': 'Assets/Female3DCG/AssetStrings',
  'Assets/Female3DCG': 'Assets/Female3DCG/Female3DCG',
}[source]);

export function parseBcTranslations(source) {
  const lines = source.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
    .filter(line => !line.startsWith('###')).map(line => line.trim());
  const pairs = new Map();
  for (let i = 0; i + 1 < lines.length; i += 2) {
    if (lines[i] && !pairs.has(lines[i])) pairs.set(lines[i], lines[i + 1]);
  }
  return pairs;
}

export function bcTranslation(dictionary, key, english) {
  return dictionary.get(key) ?? dictionary.get(english.trim());
}
