import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function needsFullCheck(paths) {
  return paths.some(path => path.startsWith('docs/architecture/') ||
    !(path.endsWith('.md') || path.startsWith('docs/')));
}

export function classify(eventName, event, diff) {
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
  if (!['push', 'pull_request'].includes(eventName) ||
      ![base, head].every(sha => /^[a-f0-9]{40}$/i.test(sha ?? '') && !/^0+$/.test(sha))) return true;
  try {
    return needsFullCheck(diff(base, head, eventName === 'pull_request'));
  } catch {
    return true; // Missing history must never bypass verification.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const full = classify(process.env.GITHUB_EVENT_NAME, event, (base, head, pr) =>
    execFileSync('git', ['diff', '--name-only', '--no-renames', '-z',
      ...(pr ? [`${base}...${head}`] : [base, head]), '--'], { encoding: 'utf8' })
      .split('\0').filter(Boolean));
  appendFileSync(process.env.GITHUB_OUTPUT, `full=${full}\n`);
  console.log(full ? 'Full build and tests required.' : 'Documentation links only.');
}
