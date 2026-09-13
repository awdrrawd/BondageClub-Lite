// Public aggregates only. Keep this file identical in Lite and Relay.
const TTL = 300000;
const QUERY = `query Load($account: string, $script: string, $start: string, $today: string, $end: string) {
  viewer { accounts(filter: {accountTag: $account}) {
    total: workersInvocationsAdaptive(limit: 1, filter: {scriptName: $script, datetime_geq: $start, datetime_lt: $end}) {
      sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 }
    }
    today: workersInvocationsAdaptive(limit: 1, filter: {scriptName: $script, datetime_geq: $today, datetime_lt: $end}) { sum { requests errors } }
    hours: workersInvocationsAdaptive(limit: 50, filter: {scriptName: $script, datetime_geq: $start, datetime_lt: $end}, orderBy: [datetimeHour_ASC]) {
      dimensions { datetimeHour } sum { requests errors }
    }
  } }
}`;
const response = (data, status=200) => Response.json(data, {status, headers: {
  'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff',
}});
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function summarize(account, now, label) {
  if (!account || !Array.isArray(account.total) || !Array.isArray(account.today) || !Array.isArray(account.hours)) throw new Error('shape');
  if (account.hours.length >= 50 || account.total.length > 1 || account.today.length > 1) throw new Error('incomplete');
  const total = account.total[0], today = account.today[0];
  const hours = account.hours.map(row => {
    const hour = row.dimensions?.datetimeHour;
    if (!hour || !Number.isFinite(Date.parse(hour))) throw new Error('time');
    return {hour: new Date(hour).toISOString(), requests:number(row.sum?.requests), errors:number(row.sum?.errors)};
  });
  return {state: total ? 'ready' : 'no_data', project:label, updatedAt:new Date(now).toISOString(),
    from:new Date(now-86400000).toISOString(), to:new Date(now).toISOString(),
    todayUTC:new Date(now).toISOString().slice(0,10),
    requests:number(total?.sum?.requests), errors:number(total?.sum?.errors),
    cpuP50Us:number(total?.quantiles?.cpuTimeP50), cpuP99Us:number(total?.quantiles?.cpuTimeP99),
    todayRequests:number(today?.sum?.requests), hours};
}
export function createMonitor({fetcher=(...args)=>fetch(...args), clock=()=>Date.now()}={}) {
  // Cache and single-flight are per isolate; edge cache also shares across isolates in a location.
  let memo, pending, configKey;
  return async function monitor(request, env, label) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return response({state:'method_not_allowed'},405);
    if (url.search) return response({state:'invalid_request'},400);
    if (env.MONITOR_ENABLED !== 'true') return response({state:'disabled',project:label});
    const account=env.MONITOR_ACCOUNT_ID, token=env.MONITOR_API_TOKEN, script=env.MONITOR_SCRIPT_NAME;
    if (!/^[a-f0-9]{32}$/i.test(account || '') || !token || !script || script.length > 256) return response({state:'not_configured',project:label});
    const dataset=env.MONITOR_DATASET || 'pagesFunctionsInvocationsAdaptiveGroups';
    if (!['pagesFunctionsInvocationsAdaptiveGroups','workersInvocationsAdaptive'].includes(dataset)) return response({state:'not_configured',project:label});
    const key = JSON.stringify([account,token,script,dataset]);
    if (key !== configKey) { memo=undefined; pending=undefined; configKey=key; }
    const now=clock();
    if (memo && memo.expires > now) return response(memo.data);
    if (!pending) pending=(async()=>{
      // A configuration fingerprint prevents serving a previous project's cached metrics.
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
      const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const cacheKey=new Request(`${url.origin}/__monitor_cache_v1/${fingerprint}`);
      const cache=globalThis.caches?.default;
      try {
        const hit=await cache?.match(cacheKey);
        if (hit) {
          const data=await hit.json();
          const expires=Date.parse(data.updatedAt)+TTL;
          if (expires>clock()) return {data,expires};
        }
      } catch { /* Cache is an optimization, not an availability requirement. */ }
      let data;
      try {
        const end=new Date(now).toISOString();
        const res=await fetcher('https://api.cloudflare.com/client/v4/graphql',{
          method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({query:QUERY.replaceAll('workersInvocationsAdaptive',dataset),variables:{account,script,start:new Date(now-86400000).toISOString(),today:end.slice(0,10)+'T00:00:00.000Z',end}}),
          signal:AbortSignal.timeout(10000),redirect:'error',
        });
        if (!res.ok) throw new Error('upstream');
        const body=await res.json();
        if (body.errors?.length) throw new Error('graphql');
        data=summarize(body.data?.viewer?.accounts?.[0],now,label);
      } catch {
        // Never send CF errors, token, script identifiers or raw response fields to visitors.
        data={state:'unavailable',project:label,updatedAt:new Date(now).toISOString()};
      }
      try { await cache?.put(cacheKey,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300'}})); } catch {}
      return {data,expires:now+TTL};
    })();
    const current=pending;
    try { const result=await current; if(configKey===key) memo=result; return response(result.data); }
    finally { if(pending===current) pending=undefined; }
  };
}
export const monitor = createMonitor();
