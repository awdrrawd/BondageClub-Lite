import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const textSources = [
  'Screens/Interface', 'Assets/Female3DCG/AssetStrings',
  'Screens/Online/ChatRoom/Text_ChatRoom',
  'Screens/Character/Preference/ActivityDictionary',
  'Assets/Female3DCG/Female3DCG'
];
export async function fetchBcText(destination, fetcher = fetch) {
  if (existsSync(destination) && readdirSync(destination).length) throw new Error('Destination must be empty');
  const repo = 'awdrrawd/Bondage-College-Mirror';
  const get = url => fetcher(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'BC-Lite-text-sync' } });
  const commit = await get(`https://api.github.com/repos/${repo}/commits/bondageclub`);
  if (!commit.ok) throw new Error(`Mirror commit: HTTP ${commit.status}`);
  const { sha } = await commit.json();
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Invalid mirror commit');
  let files = 0;
  for (const source of textSources) {
    for (const suffix of ['.csv', '_CN.txt', '_TW.txt', '_RU.txt']) {
      const path = source + suffix;
      const response = await get(`https://raw.githubusercontent.com/${repo}/${sha}/${path}`);
      if (response.status === 404 && suffix !== '.csv') continue;
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      const body = await response.text();
      if (!body.trim() || body.length > 10_000_000) throw new Error(`${path}: invalid text size`);
      const file = resolve(destination, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      files++;
    }
  }
  writeFileSync(resolve(destination, 'PR.md'), `Update BC messages, action text, clothing/item names and group names from [mirror commit ${sha}](https://github.com/${repo}/commit/${sha}).\n\nOnly src/translations/bc is committed. No communication code, native activity rules, item permissions, plugin code or manual overrides are updated. Build and tests ran before this PR. Review text changes and approve/run CI before merging; no auto-merge.\n`);
  console.log(`Downloaded ${files} text files from ${sha}`);
  return sha;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Provide an empty destination directory');
  await fetchBcText(resolve(process.argv[2]));
}
