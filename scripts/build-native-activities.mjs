// 重新產生 Lite 的原生判定資料：native-data.json、item-properties-data.json，以及版本標記 bc-native-meta.json。
//   用法：npm run catalog:native -- <BC 原始碼目錄>
//   目錄可為程式碼鏡像（根目錄有 Assets/、Scripts/）或上游倉庫（內含 BondageClub/）；
//   舊式用法（直接傳 Female3DCG.js 路徑）仍可使用。未指定時用 ../Bondage-College-Mirror-bondageclub。
// 抽取邏輯在 native-extract.mjs，與 check-bc-native.mjs 共用。
import { writeJson } from './catalog-utils.mjs';
import { extractNativeData } from './native-extract.mjs';
import { readChangelogStamp } from './bc-source.mjs';

const input = process.argv[2] || '../Bondage-College-Mirror-bondageclub';
const { source, native, itemProperties, warnings } = extractNativeData(input);
if (!source.version) throw new Error('無法從來源讀出 GameVersion，拒絕寫入沒有版本標記的資料');
writeJson('src/action/native-data.json', native);
writeJson('src/action/item-properties-data.json', itemProperties);
writeJson('src/action/bc-native-meta.json', { gameVersion: source.version, ...readChangelogStamp(source.root) });
console.log(`BC ${source.version}（${source.layout} 佈局）：${native.activities.length} 項原生活動、${Object.keys(native.zones).length} 個部位、${Object.keys(native.items).length} 件道具規則、${Object.keys(itemProperties).length} 個擴展設定`);
for (const warning of warnings) console.warn(`警告：${warning}`);
