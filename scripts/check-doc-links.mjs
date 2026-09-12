import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Check local inline links/images and reference destinations. Remote URLs and
// heading fragments are intentionally outside this filesystem-only check.
export function brokenLinks(markdown, file, root) {
  const source = markdown.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '')
    .replace(/`+[^`\n]*`+/g, '');
  const targets = [...source.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g),
    ...source.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm)];
  const broken = [];
  for (const match of targets) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;
    let path;
    try { path = decodeURIComponent(target.split(/[?#]/)[0]); }
    catch { broken.push(target); continue; }
    if (!path) continue;
    const absolute = path.startsWith('/') ? resolve(root, '.' + path) : resolve(dirname(file), path);
    if (!existsSync(absolute)) broken.push(target);
  }
  return broken;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\0').filter(file => file.endsWith('.md') && existsSync(file));
  let failures = 0;
  for (const file of new Set(files)) {
    for (const target of brokenLinks(readFileSync(file, 'utf8'), resolve(file), root)) {
      console.error(`${file}: missing local target ${target}`);
      failures++;
    }
  }
  console.log(`Checked ${new Set(files).size} Markdown files; ${failures} broken local links.`);
  process.exitCode = failures ? 1 : 0;
}
