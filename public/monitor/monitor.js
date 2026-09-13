(() => {
  const $=id=>document.getElementById(id);
  let zh=/^(zh|tw)([-_]|$)/i.test(navigator.language), busy=false, lastAttempt=0, current;
  const languages={
    zh:{title:'負載監看',intro:'供維護者查看用量與負載，也開放其他人參考。只讀取彙總數據，不探測遊戲連線。',dashboard:'Cloudflare 管理台 ↗',integration:'接入／移植說明',refresh:'重新整理',chart:'最近 24 小時請求量',table:'每小時數據（UTC）',requests:'請求',errors:'錯誤',loading:'讀取中…',ready:'資料已更新（Cloudflare 統計可能延遲）',disabled:'監看尚未啟用。',not_configured:'管理者尚未完成監看設定。',unavailable:'目前無法取得統計，請稍後重試；這不代表遊戲故障。',no_data:'查詢未回傳資料，請管理者確認 scriptName、資料集或等待統計；不代表用量為 0。',updated:'統計取得時間',range:'查詢範圍',empty:'沒有可顯示的每小時數據',cards:['今日請求（UTC）','24h 請求','24h 執行錯誤','CPU P50（μs）','CPU P99（μs）'],limits:'每 5 分鐘更新，手動更新最短間隔 1 分鐘；背景頁面暫停查詢。數據可能抽樣、延遲，不是帳單或即時在線人數。CPU 是單次執行的百分位數，非累積 CPU／連線延遲。錯誤是 Worker 執行錯誤，非所有 HTTP 錯誤。只公開本站數據；帳號共享額度及剩餘百分比不在此頁推算。'},
    en:{title:'Load monitor',intro:'An operator dashboard for usage and load, also available for public reference. Aggregate metrics only; no game probes.',dashboard:'Cloudflare dashboard ↗',integration:'Integration / reuse guide',refresh:'Refresh',chart:'Requests over the last 24 hours',table:'Hourly data (UTC)',requests:'Requests',errors:'Errors',loading:'Loading…',ready:'Updated (Cloudflare metrics may be delayed)',disabled:'Monitoring is not enabled.',not_configured:'The operator has not completed monitoring setup.',unavailable:'Metrics are temporarily unavailable. This does not indicate a game outage.',no_data:'No data returned. Verify the script name/dataset or wait for metrics; this does not mean zero usage.',updated:'Metrics fetched',range:'Query range',empty:'No hourly data available',cards:['Today’s requests (UTC)','24h requests','24h execution errors','CPU P50 (μs)','CPU P99 (μs)'],limits:'Refreshes every 5 minutes; manual refresh has a 1-minute cooldown. Hidden tabs pause queries. Metrics may be sampled or delayed; these are not billing figures or online-player counts. CPU shows per-execution percentiles, not total CPU or connection latency. Errors are Worker invocation errors, not all HTTP errors. Only this project is exposed; shared account quota and remaining allowance are not estimated here.'},
  };
  const reasons = {
    authorization: ['Token 權限或驗證失敗', 'Token authorization failed'],
    rate_limit: ['Cloudflare 限流', 'Cloudflare rate limit'],
    upstream_http: ['Cloudflare HTTP 錯誤', 'Cloudflare HTTP error'],
    invalid_response: ['回應不是有效 JSON', 'Invalid JSON response'],
    query_limit: ['查詢超過資料集限制', 'Dataset query limit'],
    query_schema: ['GraphQL 查詢格式不相容', 'Incompatible GraphQL query'],
    graphql: ['Cloudflare 拒絕查詢', 'Cloudflare rejected the query'],
    response_shape: ['統計回應結構不符', 'Unexpected metrics structure'],
    network: ['查詢連線失敗或逾時', 'Query connection failed or timed out'],
  };
  const format=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat(zh?'zh-TW':'en',{maximumFractionDigits:2}).format(value):'—';
  function render() {
    const t=languages[zh?'zh':'en'];document.documentElement.lang=zh?'zh-Hant':'en';
    for(const [id,key] of Object.entries({dashboard:'dashboard',integration:'integration',title:'title',intro:'intro',refresh:'refresh',chartTitle:'chart',tableTitle:'table',requestsLabel:'requests',errorsLabel:'errors',limits:'limits'})) $(id).textContent=t[key];
    $('language').textContent=zh?'English':'中文';$('project').textContent=current?.project||'—';
    $('status').textContent=busy?t.loading:t[current?.state]||t.unavailable;
    if (!busy && current?.state === 'unavailable' && Object.hasOwn(reasons, current.reason)) $('status').textContent += ` (${current.reason}: ${reasons[current.reason][zh ? 0 : 1]})`;
    const usable=current?.state==='ready';const values=usable?[current.todayRequests,current.requests,current.errors,current.cpuP50Us,current.cpuP99Us]:[];
    $('cards').replaceChildren(...t.cards.map((label,i)=>{const card=document.createElement('article');card.className='card';const name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent=format(values[i]);card.append(name,value);return card;}));
    const hours=usable&&Array.isArray(current.hours)?current.hours:[];
    $('rows').replaceChildren(...hours.map(row=>{const tr=document.createElement('tr');for(const value of [row.hour,format(row.requests),format(row.errors)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}return tr;}));
    $('chart').replaceChildren();$('chart').setAttribute('aria-label',t.chart);
    if(hours.length){
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 160');svg.setAttribute('aria-hidden','true');
      const max=Math.max(1,...hours.map(h=>h.requests||0)),width=1000/hours.length;
      hours.forEach((h,i)=>{const rect=document.createElementNS(ns,'rect'),height=(h.requests||0)/max*150;rect.setAttribute('x',String(i*width+2));rect.setAttribute('y',String(155-height));rect.setAttribute('width',String(Math.max(1,width-4)));rect.setAttribute('height',String(height));svg.append(rect)});$('chart').append(svg);
    }else $('chart').textContent=t.empty;
    $('updated').textContent=current?.updatedAt?`${t.updated}: ${current.updatedAt}${current.from?` · ${t.range}: ${current.from} — ${current.to}`:''}`:'—';
    $('refresh').disabled=busy||Date.now()-lastAttempt<60000;
  }
  async function refresh(){
    if(busy||document.hidden||Date.now()-lastAttempt<60000)return;
    busy=true;lastAttempt=Date.now();render();
    try{const res=await fetch('/api/monitor',{signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error();current=await res.json();}
    catch{current={state:'unavailable'};}
    finally{busy=false;render();setTimeout(()=>{$('refresh').disabled=busy},60000);}
  }
  $('refresh').addEventListener('click',refresh);$('language').addEventListener('click',()=>{zh=!zh;render()});
  setInterval(refresh,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastAttempt>=300000)refresh()});refresh();
})();
