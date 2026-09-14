(() => {
  const $=id=>document.getElementById(id);
  let zh=/^(zh|tw)([-_]|$)/i.test(navigator.language), busy=false, lastAttempt=0, current, view='overview';
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
  const views={overview:[0,1,4,5],history:[2,3],errors:[4,5],performance:[6,7]};
  const tabs=Array.from(document.querySelectorAll('[data-view]'));
  function selectView(next){view=next;render();}
  for(const tab of tabs){
    tab.addEventListener('click',()=>selectView(tab.dataset.view));
    tab.addEventListener('keydown',event=>{
      const index=tabs.indexOf(tab);
      const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
      if(next!==null){event.preventDefault();selectView(tabs[next].dataset.view);tabs[next].focus();}
    });
  }
  function render() {
    const tabLabels=zh?['總覽','週月統計','錯誤','效能']:['Overview','History','Errors','Performance'];
    tabs.forEach((tab,i)=>{tab.textContent=tabLabels[i];tab.setAttribute('aria-selected',String(tab.dataset.view===view));tab.tabIndex=tab.dataset.view===view?0:-1;});
    $('view-panel').setAttribute('aria-labelledby','tab-'+view);
    $('notes-label').textContent=zh?'統計說明與限制':'Methodology & limitations';
    $('chart-panel').hidden=view==='history'||view==='performance';
    const t=languages[zh?'zh':'en'];document.documentElement.lang=zh?'zh-Hant':'en';
    for(const [id,key] of Object.entries({dashboard:'dashboard',integration:'integration',title:'title',intro:'intro',refresh:'refresh',chartTitle:'chart',tableTitle:'table',requestsLabel:'requests',errorsLabel:'errors',limits:'limits'})) $(id).textContent=t[key];
    $('language').textContent=zh?'English':'中文';$('project').textContent=current?.project||'—';
    $('status').textContent=busy?t.loading:t[current?.state]||t.unavailable;
    if (!busy && current?.state === 'unavailable' && Object.hasOwn(reasons, current.reason)) $('status').textContent += ` (${current.reason}: ${reasons[current.reason][zh ? 0 : 1]})`;
    const usable=current?.state==='ready'||current?.state==='no_data';
    const data=usable?current:{};
    const week=data.history?.week,month=data.history?.month;
    const rate=typeof data.requests==='number' && data.requests>0 && typeof data.errors==='number' ? data.errors/data.requests*100 : null;
    const metrics=[
      [t.cards[0],data.todayRequests,zh?'UTC 今日累計，尚未滿一天':'UTC day to date; incomplete day'],
      [t.cards[1],data.requests,zh?'最近 24 小時滾動總量':'Rolling 24-hour total'],
      [zh?'週平均 / 日':'Weekly average / day',week?.dailyAverage,zh?'前 7 個完整 UTC 日 ÷ 7':'Previous 7 complete UTC days ÷ 7'],
      [zh?'月平均 / 日':'Monthly average / day',month?.dailyAverage,zh?'前 30 個完整 UTC 日 ÷ 30':'Previous 30 complete UTC days ÷ 30'],
      [t.cards[2],data.errors,zh?'未捕捉例外、資源超限或內部錯誤':'Uncaught exceptions, resource limits or internal errors'],
      [zh?'24h 執行錯誤率':'24h invocation error rate',rate,zh?'執行錯誤 ÷ 請求；無請求時未知':'Invocation errors ÷ requests; unknown without requests','%'],
      [t.cards[3],data.cpuP50Us,zh?'單次 CPU 中位數，不含等待網路時間':'Median CPU per invocation; excludes network wait'],
      [t.cards[4],data.cpuP99Us,zh?'99% 執行的 CPU 時間不超過此值':'99% of invocations used at most this CPU time'],
    ];
    $('cards').replaceChildren(...metrics.filter((_,i)=>views[view].includes(i)).map(([label,amount,hint,unit],i)=>{
      const card=document.createElement('article');card.className='card'+(i<2?' featured':'')+(label===t.cards[2]&&amount>0?' warning':'');
      const name=document.createElement('span'),value=document.createElement('strong'),note=document.createElement('small');
      name.textContent=label;value.textContent=format(amount)+(typeof amount==='number'&&unit?unit:'');note.textContent=hint;
      card.append(name,value,note);return card;
    }));
    $('status').dataset.state=busy?'loading':current?.state||'unavailable';
    const hours=usable&&Array.isArray(current.hours)?current.hours:[];
    $('insight-title').textContent=zh?'重點與錯誤說明':'Highlights & error guidance';
    const peak=hours.filter(h=>typeof h.requests==='number').reduce((best,h)=>!best||h.requests>best.requests?h:best,null);
    const insights=[
      [zh?'尖峰時段（UTC）':'Peak hour (UTC)',peak?`${peak.hour} · ${format(peak.requests)} ${t.requests}`:t.empty],
      [zh?'歷史統計':'Historical metrics',data.history?.state==='ready'
        ? `${week.from.slice(0,10)} → ${week.to.slice(0,10)} · ${zh?'7 日總量':'7-day total'} ${format(week.requests)} / ${zh?'30 日總量':'30-day total'} ${format(month.requests)}. ${zh?'月統計起日：':'30-day start: '}${month.from.slice(0,10)}`
        : zh?'歷史資料未取得；不以 24 小時數據推估週月平均。':'History unavailable; weekly/monthly averages are not extrapolated from 24 hours.'],
      [zh?'如何判讀錯誤':'Reading errors',zh?'執行錯誤不等於 HTTP 4xx/5xx 或遊戲斷線。這裡不提供原始錯誤訊息；請到 Cloudflare 管理台的執行日誌查看例外與 stack。':'Invocation errors are not HTTP 4xx/5xx or game disconnects. Raw errors are not exposed here; inspect exceptions and stacks in Cloudflare logs.'],
      [zh?'平均值範圍':'Average scope',zh?'以完整 7／30 日為分母，含無流量日與部署前的日期，不代表活躍日平均；API 無資料時顯示未知。':'Uses full 7/30-day denominators, including zero-traffic and pre-deployment days, not active days. No API data means unknown.'],
    ];
    const shownInsights=view==='overview'?[insights[0]]:view==='history'?[insights[1],insights[3]]:view==='errors'?[insights[2]]:[
      [zh?'CPU P50 / P99':'CPU P50 / P99',zh?'P50 反映典型執行成本，P99 反映較慢的尾端執行；兩者皆為最近 24 小時、單位 μs。':'P50 describes typical execution cost; P99 describes slower tail invocations. Both cover the last 24 hours in μs.'],
      [zh?'不是連線速度':'Not connection speed',zh?'CPU 不包含等待網路的時間，不能用來判斷遊戲延遲或可用性。目前未收集 CPU 時序資料，因此不繪製推估趨勢。':'CPU excludes network waits and does not measure game latency or availability. No CPU time series is collected, so no estimated trend is drawn.'],
    ];
    $('insights').replaceChildren(...shownInsights.map(([title,text])=>{const item=document.createElement('article'),heading=document.createElement('h3'),body=document.createElement('p');heading.textContent=title;body.textContent=text;item.append(heading,body);return item}));
    $('rows').replaceChildren(...hours.map(row=>{const tr=document.createElement('tr');for(const value of [row.hour,format(row.requests),format(row.errors)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}return tr;}));
    const chartMetric=view==='errors'?'errors':'requests';
    if(view==='errors') $('chartTitle').textContent=zh?'最近 24 小時執行錯誤':'Invocation errors over the last 24 hours';
    $('chart').replaceChildren();$('chart').setAttribute('aria-label',$('chartTitle').textContent);
    if(hours.length){
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox','0 0 720 260');svg.setAttribute('aria-hidden','true');
      const node=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;svg.append(el);return el};
      const left=88,top=30,plotWidth=612,plotHeight=175;
      const peak=Math.max(0,...hours.map(h=>h[chartMetric]||0));
      const step=Math.max(1,10**Math.floor(Math.log10(Math.max(1,peak/4))));
      const tickStep=Math.max(1,Math.ceil(peak/4/step)*step),max=tickStep*4;
      node('text',{x:left,y:16,class:'axis-caption'},view==='errors'?t.errors:t.requests);
      for(let i=0;i<=4;i++){
        const y=top+plotHeight-i*plotHeight/4;
        node('line',{x1:left,x2:left+plotWidth,y1:y,y2:y,class:'grid-line'});
        node('text',{x:left-10,y:y+4,'text-anchor':'end',class:'axis-label'},format(i*tickStep));
      }
      const sorted=[...hours].sort((a,b)=>Date.parse(a.hour)-Date.parse(b.hour));
      const start=Date.parse(sorted[0].hour),end=Date.parse(sorted.at(-1).hour)+3600000,span=end-start;
      const width=plotWidth*3600000/span;
      sorted.forEach(h=>{
        const value=h[chartMetric],height=(value||0)/max*plotHeight;
        const rect=node('rect',{x:left+(Date.parse(h.hour)-start)/span*plotWidth+2,y:top+plotHeight-height,width:Math.max(1,width-4),height});
        const tip=document.createElementNS(ns,'title');tip.textContent=`${h.hour} · ${format(h.requests)} ${t.requests} · ${format(h.errors)} ${t.errors}`;rect.append(tip);
      });
      for(let i=0;i<=4;i++){
        const time=new Date(start+span*i/4),x=left+plotWidth*i/4;
        node('text',{x,y:226,'text-anchor':i===0?'start':i===4?'end':'middle',class:'axis-label'},time.toISOString().slice(11,16));
        node('text',{x,y:244,'text-anchor':i===0?'start':i===4?'end':'middle',class:'axis-label'},time.toISOString().slice(5,10));
      }
      node('text',{x:10,y:236,class:'axis-caption'},'UTC');
      $('chart').append(svg);
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
