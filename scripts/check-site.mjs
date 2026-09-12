import { pathToFileURL } from 'node:url';

const origin = 'https://bondageclub-lite.pages.dev';
export async function checkSite(fetcher = fetch) {
  for (const [path, title] of [['/', 'BC Lite'], ['/docs/architecture/', 'BC Lite · Architecture'], ['/api/relay-status', null]]) {
    const response = await fetcher(origin + path, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
    if (title) {
      if (!(response.headers.get('content-type') ?? '').includes('text/html') ||
          !(await response.text()).includes(`<title>${title}</title>`)) {
        throw new Error(`${path}: unexpected page (possibly an error or fallback page)`);
      }
    } else {
      const data = await response.json();
      if (data.service !== 'bc-lite-relay' || data.version !== 1 || data.transport !== 'websocket') {
        throw new Error(`${path}: unexpected relay metadata`);
      }
    }
    console.log(`OK ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkSite().catch(error => { console.error(error.message); process.exitCode = 1; });
}
