// Shared by the downloader and extractor so adding a locale cannot silently
// omit its upstream files. JP/KR may legitimately be absent upstream.
export const bcTextLocales = { zh: 'TW', 'zh-cn': 'CN', ru: 'RU', de: 'DE', fr: 'FR', uk: 'UA', ja: 'JP', ko: 'KR' };
