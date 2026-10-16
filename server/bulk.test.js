import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './app.js';
test('bulk enquiries validate input, deduplicate retries and restrict administration',async()=>{
 const rows=new Map();const repository={createBulk:async r=>{if(!rows.has(r.id))rows.set(r.id,r)},listBulk:async()=>[...rows.values()],updateBulk:async(id,revision,changes)=>{const r=rows.get(id);if(!r||r.revision!==revision)return null;const n={...r,...changes,revision:revision+1};rows.set(id,n);return n}};
 const app=createApp({repository,origins:[],authenticate:async req=>req.headers.authorization==='admin'?{userId:'admin',isAdmin:true}:req.headers.authorization==='user'?{userId:'user',isAdmin:false}:null});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api';
 const payload={requestKey:'12345678-1234-1234-1234-123456789012',details:{Name:'Test',Email:'test@example.com',Phone:'+919999999999',Occasion:'Corporate gifting',Quantity:'50','Delivery location':'Mumbai, India'}};
 const post=p=>fetch(url+'/bulk-enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
 try{
 assert.equal((await post({...payload,details:{...payload.details,Quantity:'1.5'}})).status,400);
 assert.equal((await post(payload)).status,201);assert.equal((await post(payload)).status,201);assert.equal(rows.size,1);
 assert.equal((await fetch(url+'/admin/bulk-enquiries')).status,401);
 assert.equal((await fetch(url+'/admin/bulk-enquiries',{headers:{Authorization:'user'}})).status,403);
 const all=await fetch(url+'/admin/bulk-enquiries',{headers:{Authorization:'admin'}});assert.equal((await all.json()).length,1);
 const patch=(revision,status)=>fetch(url+'/admin/bulk-enquiries/'+payload.requestKey,{method:'PATCH',headers:{Authorization:'admin','Content-Type':'application/json'},body:JSON.stringify({revision,status,note:'Follow up'})});
 assert.equal((await patch(0,'quoted')).status,200);assert.equal((await patch(0,'closed')).status,409);assert.equal((await patch(1,'invalid')).status,400);
 }finally{await new Promise(r=>server.close(r))}
});
