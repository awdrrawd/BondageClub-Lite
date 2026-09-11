import { localDay, type HistoryMessage } from './history';

export type ExportFormat = 'txt' | 'html' | 'xlsx';
export interface ExportLabels { columns: string[]; private: string; title: string; type: (type: string) => string }
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
function selected(records: HistoryMessage[], day: string, includePrivate: boolean): HistoryMessage[] {
  return records.filter(r => localDay(r.timestamp) === day && (includePrivate || r.kind === 'room'))
    .sort((a,b) => a.timestamp-b.timestamp || a.key.localeCompare(b.key));
}
function cells(row: HistoryMessage, labels: ExportLabels): string[] {
  const m=row.message;
  return [new Date(row.timestamp).toLocaleString('sv-SE'), row.kind==='room'?row.room:labels.private, labels.type(m.type),
    String(m.sender ?? ''), m.senderName, String(m.target ?? ''), m.targetName || '', m.text];
}

/** Standalone, script-free reading page. Player text never becomes markup or remote media. */
export function exportHistoryHTML(records: HistoryMessage[], day: string, includePrivate: boolean, labels: ExportLabels): string {
  const groups=new Map<string,HistoryMessage[]>();
  for (const row of selected(records,day,includePrivate)) {
    const key=row.kind==='room'?`room:${row.room}`:'private';
    const group=groups.get(key) || []; group.push(row); groups.set(key,group);
  }
  const sections=[...groups.values()].map(rows=>`<section><h2>${escape(rows[0].kind==='room'?rows[0].room:labels.private)}</h2>${rows.map(row=>{
    const c=cells(row,labels);
    return `<article><header><time>${escape(c[0])}</time> · ${escape(c[2])} · <strong>${escape(c[4])}</strong> #${escape(c[3])}${c[5]?` → ${escape(c[6])} #${escape(c[5])}`:''}</header><p>${escape(c[7])}</p></article>`;
  }).join('')}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(labels.title)} — ${escape(day)}</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f3f5f8;color:#172331}main{max-width:960px;margin:auto;padding:24px}h1{font-size:26px}h2{position:sticky;top:0;background:#e5ebf3;padding:12px;border-radius:8px;font-size:19px}article{background:white;border:1px solid #d7dfe8;border-radius:8px;margin:10px 0;padding:14px}header{color:#43536a;font-size:13px;overflow-wrap:anywhere}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}@media print{body{background:white}h2{position:static}article{break-inside:avoid}}</style></head><body><main><h1>${escape(labels.title)} — ${escape(day)}</h1>${sections}</main></body></html>`;
}

/** Minimal ZIP (stored entries) for the fixed OOXML package; no CDN or general spreadsheet engine. */
function zip(files: Record<string,string>): Uint8Array<ArrayBuffer> {
  const encoder=new TextEncoder(), parts:Uint8Array[]=[], directory:Uint8Array[]=[];
  let offset=0;
  const header=(size:number)=>new DataView(new ArrayBuffer(size));
  for (const [path,text] of Object.entries(files)) {
    const name=encoder.encode(path), data=encoder.encode(text);
    let crc=0xffffffff;
    for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    crc=(crc^0xffffffff)>>>0;
    const local=header(30);local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(12,33,true);
    local.setUint32(14,crc,true);local.setUint32(18,data.length,true);local.setUint32(22,data.length,true);local.setUint16(26,name.length,true);
    parts.push(new Uint8Array(local.buffer),name,data);
    const central=header(46);central.setUint32(0,0x02014b50,true);central.setUint16(4,20,true);central.setUint16(6,20,true);central.setUint16(14,33,true);
    central.setUint32(16,crc,true);central.setUint32(20,data.length,true);central.setUint32(24,data.length,true);central.setUint16(28,name.length,true);central.setUint32(42,offset,true);
    directory.push(new Uint8Array(central.buffer),name);offset+=30+name.length+data.length;
  }
  const directorySize=directory.reduce((sum,part)=>sum+part.length,0), end=header(22);
  end.setUint32(0,0x06054b50,true);end.setUint16(8,directory.length/2,true);end.setUint16(10,directory.length/2,true);end.setUint32(12,directorySize,true);end.setUint32(16,offset,true);
  const output=new Uint8Array(offset+directorySize+22);let cursor=0;
  for(const part of [...parts,...directory,new Uint8Array(end.buffer)]){output.set(part,cursor);cursor+=part.length;}
  return output;
}

/** All cells are explicit strings, including leading '='; player messages cannot become formulas. */
export function exportHistoryXLSX(records: HistoryMessage[], day: string, includePrivate: boolean, labels: ExportLabels): Uint8Array<ArrayBuffer> {
  const rows=[labels.columns,...selected(records,day,includePrivate).map(row=>cells(row,labels))];
  if(rows.length>1048576)throw new Error('Excel row limit exceeded');
  const xml=(text:string)=>escape(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/_x([0-9a-f]{4})_/gi,'_x005F_x$1_'));
  const sheet=rows.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>{
    if(value.length>32767)throw new Error('Excel cell text limit exceeded; use HTML or TXT');
    return `<c r="${String.fromCharCode(65+j)}${i+1}" t="inlineStr" s="${i===0?1:0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main', rel='http://schemas.openxmlformats.org/package/2006/relationships';
  return zip({
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="ChatLog" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':`<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><dimension ref="A1:H${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="7" width="18" customWidth="1"/><col min="8" max="8" width="80" customWidth="1"/></cols><sheetData>${sheet}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`
  });
}
