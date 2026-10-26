import { readFileSync } from 'node:fs';
import { isReviewedSource } from './reviewed-bc-text.mjs';

const reviewed = JSON.parse(readFileSync('src/translations/reviewed-bc-sources.json', 'utf8'));
const source = Object.assign({}, ...['actions', 'messages'].map(category =>
  JSON.parse(readFileSync(`src/translations/bc/${category}/en.json`, 'utf8'))));
const pending = Object.keys(source).filter(key =>
  /^(?:Chat(?:Self|Other)-|Label-|Action|Activity|Pronoun|DialogGroupName)/.test(key)
  && !isReviewedSource(reviewed, key, source[key])).sort();
console.log(`\n## Manual translation review\n\n${pending.length} new or changed BC action sources need review. Current upstream translations or English fallback are used; stale reviewed overrides are ignored.\n`);
for (const key of pending) console.log(`- \`${key}\``);
