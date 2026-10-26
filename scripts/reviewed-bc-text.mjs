import { createHash } from 'node:crypto';

// Records the English source used when manual BC translations were reviewed.
// A changed source must be reviewed again before its old override can be used.
export const sourceHash = text => createHash('sha256').update(text).digest('hex');
export const isReviewedSource = (reviewed, key, text) =>
  typeof text === 'string' && reviewed[key] === sourceHash(text);
