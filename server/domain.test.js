import test from 'node:test';import assert from 'node:assert/strict';
import {initialCommerce} from '../src/commerceModel.js';
import {placeOrder,applyAdminChanges,publicState} from './domain.js';
import {createApp} from './app.js';
const identity={userId:'user_one',email:'verified@example.com',isAdmin:false};
const payload=(key='one')=>({cart:{sol:1},currency:'USD',requestKey:key,details:{firstName:'Test',lastName:'Customer',email:'spoof@example.com',address:'Test street',city:'City',country:'India',region:'State',postal:'12345'}});
const state=()=>({...initialCommerce(),revision:0});
test('orders use database prices and verified identity, not client totals or email',()=>{const p={...payload(),total:0};const next=placeOrder(state(),p,identity);assert.equal(next.orders[0].total,32);assert.equal(next.orders[0].email,identity.email);assert.equal(next.orders[0].userId,identity.userId);assert.equal(next.orders[0].postal,'12345');assert.equal(next.products[0].stock,23);assert.equal(next.orders[0].paymentStatus,'unpaid')});
test('retries do not duplicate orders or consume stock twice',()=>{const first=placeOrder(state(),payload(),identity);const repeat=placeOrder(first,payload(),identity);assert.equal(repeat.orders.length,1);assert.equal(repeat.products[0].stock,23)});
test('overselling, missing addresses and fractional quantities fail',()=>{const d=state();d.products[0].stock=1;assert.throws(()=>placeOrder(d,{...payload(),cart:{sol:2}},identity));assert.throws(()=>placeOrder(d,{...payload(),cart:{sol:1.5}},identity));assert.throws(()=>placeOrder(d,{...payload(),details:{}},identity))});
test('public store never includes orders, customers or internal activity',()=>{const d=placeOrder(state(),payload(),identity);d.activity=[{id:'a',text:'private'}];const p=publicState(d);assert.deepEqual(p.orders,[]);assert.deepEqual(p.customers,[]);assert.deepEqual(p.activity,[])});
test('admin edits reject stale revisions and manipulation of order totals',()=>{const d=placeOrder(state(),payload(),identity);assert.throws(()=>applyAdminChanges(d,{revision:4,changes:[]}),/changed/);assert.throws(()=>applyAdminChanges(d,{revision:0,changes:[{resource:'orders',id:d.orders[0].id,value:{...d.orders[0],total:0}}]}),/cannot be edited/)});
test('admin cancellation restores stock once and preserves account identity',()=>{const d=placeOrder(state(),payload(),identity);const order=d.orders[0];const patch={revision:0,changes:[{resource:'orders',id:order.id,value:{...order,status:'cancelled'}}]};const next=applyAdminChanges(d,patch);assert.equal(next.products[0].stock,24);assert.equal(next.orders[0].userId,identity.userId);assert.equal(applyAdminChanges(next,patch).products[0].stock,24)});
test('product specs are saved and invalid stock rejected by the server',()=>{const d=state();const product={...d.products[0],burnTime:'40 hours',waxType:'Soy',color:'Ivory',fragrance:'Amber'};const p={revision:0,changes:[{resource:'products',id:product.id,value:product}]};assert.equal(applyAdminChanges(d,p).products[0].waxType,'Soy');assert.throws(()=>applyAdminChanges(d,{...p,changes:[{resource:'products',id:product.id,value:{...product,stock:-1}}]}))});
test('HTTP API denies anonymous orders, non-admin writes and exposes only owned orders',async()=>{let data=placeOrder(state(),payload(),identity);const repo={read:async()=>structuredClone(data),transact:async fn=>{data={...await fn(structuredClone(data)),revision:data.revision+1};return data}};const app=createApp({repository:repo,origins:['http://localhost'],authenticate:async req=>req.headers.authorization==='Bearer admin'?{...identity,isAdmin:true}:req.headers.authorization==='Bearer other'?{...identity,userId:'user_two'}:req.headers.authorization==='Bearer customer'?identity:null});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/api`;try{assert.equal((await fetch(url+'/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())})).status,401);assert.equal((await fetch(url+'/admin/state',{headers:{Authorization:'Bearer customer'}})).status,403);const other=await fetch(url+'/orders',{headers:{Authorization:'Bearer other'}});assert.deepEqual(await other.json(),[]);assert.equal((await fetch(url+'/admin/state',{headers:{Authorization:'Bearer admin'}})).status,200);assert.equal((await (await fetch(url+'/orders',{headers:{Authorization:'Bearer customer'}})).json()).length,1)}finally{await new Promise(resolve=>server.close(resolve))}});
test('deleting products preserves order snapshots and new products are first',()=>{
 const d=placeOrder(state(),payload(),identity);const snapshot=structuredClone(d.orders[0]);
 const removed=applyAdminChanges(d,{revision:0,changes:[{resource:'products',id:'sol',value:null}]});
 assert.equal(removed.products.some(p=>p.id==='sol'),false);assert.deepEqual(removed.orders[0],snapshot);
 const product={...d.products[0],id:'new',sku:'new-sku'};
 const added=applyAdminChanges(d,{revision:0,changes:[{resource:'products',id:'new',value:product}]});assert.equal(added.products[0].id,'new');assert.ok(added.products[0].createdAt);
 assert.throws(()=>applyAdminChanges(d,{revision:0,changes:[{resource:'categories',id:d.categories[0].id,value:null}]}),/Move products/);
});
test('admin order removal retains payment, stock and customer history',()=>{
 const d=placeOrder(state(),payload(),identity);const order=d.orders[0];
 const next=applyAdminChanges(d,{revision:0,changes:[{resource:'orders',id:order.id,value:{...order,adminDeleted:true}}]});
 assert.equal(next.orders[0].adminDeleted,true);assert.equal(next.orders[0].paymentStatus,order.paymentStatus);assert.equal(next.orders[0].total,order.total);assert.deepEqual(next.products,d.products);assert.equal(next.orders[0].userId,identity.userId);
 assert.throws(()=>applyAdminChanges(d,{revision:0,changes:[{resource:'orders',id:order.id,value:null}]}));
});
test('checkout confirmation recipient is separate from account ownership',async()=>{
 const {confirmationMessage}=await import('./notifications.js');const p=payload();p.details.email=' Receipt@Example.com ';
 const next=placeOrder(state(),p,identity);const order=next.orders[0];assert.equal(order.contactEmail,'receipt@example.com');assert.equal(order.email,identity.email);assert.equal(order.userId,identity.userId);
 assert.equal(confirmationMessage({...order,paymentAmount:100}).to,'receipt@example.com');
 assert.throws(()=>placeOrder(state(),{...p,details:{...p.details,email:'bad\r\nBcc:someone@example.com'}},identity),/checkout email/);
 assert.throws(()=>placeOrder(state(),{...p,details:{...p.details,email:''}},identity),/checkout email/);
});
