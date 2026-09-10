import { compileCatalogs } from '../scripts/compile-action-catalogs.mjs';
const compiled = compileCatalogs();
export const gameCatalog = locale => ({ ...compiled.en, ...(locale === 'en' ? {} : compiled[locale]) });
