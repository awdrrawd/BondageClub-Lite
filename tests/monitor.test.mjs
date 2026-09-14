import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor as actualMonitor, summarize, historyQuery, summarizeHistory} from '../public/_monitor.js';
// Existing 24h tests isolate the optional history request.
const createMonitor=options=>actualMonitor({...options,fetcher:(url,init)=>JSON.parse(init.body).query.startsWith('query History') ? Promise.resolve(Response.json({errors:[{message:'history unavailable'}]})) : options.fetcher(url,init)});
const date=Date.parse('2026-09-13T12:00:00Z');
const env={MONITOR_ENABLED:'true',MONITOR_ACCOUNT_ID:'a'.repeat(32),MONITOR_API_TOKEN:'private-token',MONITOR_SCRIPT_NAME:'private-script'};
const account={total:[{sum:{requests:100,errors:2},quantiles:{cpuTimeP50:150,cpuTimeP99:800}}],today:[{sum:{requests:20,errors:0}}],hours:[{dimensions:{datetimeHour:'2026-09-13T11:00:00Z',scriptName:'private-script'},sum:{requests:20,errors:0},secret:'do-not-publish'}]};
const request=(path='/api/monitor')=>new Request('https://site.example'+path);
test('monitor is opt-in and never queries without complete configuration',async()=>{
 let calls=0;const monitor=createMonitor({fetcher:async()=>{calls++}});
 for(const [config,state] of [[{},'disabled'],[{MONITOR_ENABLED:'true'},'not_configured']])assert.equal((await (await monitor(request(),config,'Lite')).json()).state,state);
 assert.equal(calls,0);assert.equal((await monitor(request('?account=other'),env,'Lite')).status,400);
 assert.equal((await monitor(new Request('https://site.example/api/monitor',{method:'POST'}),env,'Lite')).status,405);
});
test('monitor uses fixed scoped query, strips private fields, and shares in-flight/cached results',async()=>{
 let calls=0,now=date;
 const monitor=createMonitor({clock:()=>now,fetcher:async(url,options)=>{
   calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');assert.equal(options.headers.Authorization,'Bearer private-token');
   const {variables,query}=JSON.parse(options.body);assert.equal(variables.script,env.MONITOR_SCRIPT_NAME);assert.equal(variables.account,env.MONITOR_ACCOUNT_ID);assert.equal(variables.today,'2026-09-13T00:00:00.000Z');assert.ok(!query.includes('clientIP'));
   return Response.json({data:{viewer:{accounts:[account]}}});
 }});
 const responses=await Promise.all([monitor(request(),env,'Lite'),monitor(request(),env,'Lite')]);assert.equal(calls,1);
 const text=await responses[0].text();assert.ok(!text.includes('private'));assert.ok(!text.includes('do-not-publish'));assert.ok(!text.includes(env.MONITOR_ACCOUNT_ID));
 const data=JSON.parse(text);assert.equal(data.requests,100);assert.equal(data.cpuP50Us,150);assert.equal(data.todayRequests,20);
 now+=299000;await monitor(request(),env,'Lite');assert.equal(calls,1);
 now+=2000;await monitor(request(),env,'Lite');assert.equal(calls,2);
});
test('upstream errors do not leak credentials and failures are also cached',async()=>{
 let calls=0;const monitor=createMonitor({clock:()=>date,fetcher:async()=>{calls++;return Response.json({errors:[{message:'private-token private-script'}]})}});
 const res=await monitor(request(),env,'Lite');const text=await res.text();assert.ok(!text.includes('private'));assert.equal(JSON.parse(text).state,'unavailable');
 await monitor(request(),env,'Lite');assert.equal(calls,1);
});
test('missing metrics remain unknown and truncated results cannot look complete',()=>{
 assert.equal(summarize({total:[],today:[],hours:[]},date,'Lite').state,'no_data');
 assert.equal(summarize({total:[],today:[],hours:[]},date,'Lite').requests,null);
 assert.throws(()=>summarize({...account,hours:Array(50).fill(account.hours[0])},date,'Lite'));
 assert.throws(()=>summarize({},date,'Lite'));
 assert.equal(summarize({...account,total:[{sum:{requests:0,errors:0}}]},date,'Lite').requests,0);
});

test('Pages query uses the String scalar shown by the dashboard',async()=>{
 let captured;
 const monitor=createMonitor({clock:()=>date,fetcher:async(url,options)=>{
   captured=JSON.parse(options.body).query;
   return Response.json({data:{viewer:{accounts:[account]}}});
 }});
 const result=await (await monitor(request(),env,'Relay')).json();
 assert.equal(result.state,'ready');
 assert.equal((captured.match(/: String/g)||[]).length,5);
 assert.ok(!captured.includes(': string'));
 assert.equal((captured.match(/pagesFunctionsInvocationsAdaptiveGroups\(/g)||[]).length,3);
});

test('failure categories expose no raw upstream messages',async()=>{
 for (const [message,reason] of [['Unknown type String private-token','query_schema'],['not authorized private-token','authorization'],['query limit exceeded private-token','query_limit']]) {
  const monitor=createMonitor({clock:()=>date,fetcher:async()=>Response.json({errors:[{message}]})});
  const result=await (await monitor(request(),env,'Relay')).json();
  assert.equal(result.reason,reason);
  assert.ok(!JSON.stringify(result).includes('private-token'));
 }
});

test('monitor rejects redirects without forwarding the analytics token',async()=>{
 let calls=0;
 const monitor=createMonitor({clock:()=>date,fetcher:async(url,options)=>{
  calls++;assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://other.example/'}});
 }});
 const data=await (await monitor(request(),env,'Lite')).json();
 assert.equal(calls,1);assert.equal(data.state,'unavailable');assert.equal(data.reason,'upstream_http');
});

test('history splits thirty complete UTC days into non-overlapping windows no longer than a week',()=>{
 const {variables,query}=historyQuery('pagesFunctionsInvocationsAdaptiveGroups',date);
 assert.equal(variables.e0,'2026-09-13T00:00:00.000Z');
 assert.equal(variables.s4,'2026-08-14T00:00:00.000Z');
 for(let i=0;i<5;i++) {
  assert.ok(Date.parse(variables.e0)>=Date.parse(variables['e'+i]));
  assert.ok(Date.parse(variables['e'+i])-Date.parse(variables['s'+i])<=7*86400000);
  if(i)assert.equal(variables['e'+i],variables['s'+(i-1)]);
 }
 const rows=Object.fromEntries(Array.from({length:5},(_,i)=>['p'+i,[{sum:{requests:i===4?20:70,errors:1}}]]));
 const result=summarizeHistory(rows,variables);
 assert.equal(result.week.dailyAverage,10);assert.equal(result.month.dailyAverage,10);
 assert.equal(result.month.errors,5);
 assert.ok(query.includes('$account: String'));
 assert.equal(summarizeHistory(Object.fromEntries(Array.from({length:5},(_,i)=>['p'+i,[]])),variables).month.dailyAverage,null);
 assert.throws(()=>summarizeHistory({},variables));
});
test('history failure preserves current metrics and success returns real averages',async()=>{
 for(const fails of [true,false]) {
 const monitor=actualMonitor({clock:()=>date,fetcher:async(url,init)=>{
  if(JSON.parse(init.body).query.startsWith('query History'))return Response.json(fails?{errors:[{message:'private history failure'}]}:{data:{viewer:{accounts:[Object.fromEntries(Array.from({length:5},(_,i)=>['p'+i,[{sum:{requests:30,errors:0}}]]))]}}});
  return Response.json({data:{viewer:{accounts:[account]}}});
 }});
 const result=await (await monitor(request(),env,'Lite')).json();
 assert.equal(result.state,'ready');assert.equal(result.requests,100);
 assert.equal(result.history.state,fails?'unavailable':'ready');
 if(!fails)assert.equal(result.history.month.dailyAverage,5);
 }
});
