import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor, summarize} from '../public/_monitor.js';
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
