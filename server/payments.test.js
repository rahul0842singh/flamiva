import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createPayments} from './payments.js';
import {createApp} from './app.js';
import {initialCommerce} from '../src/commerceModel.js';
import {applyAdminChanges} from './domain.js';
const secret='test-only-secret',keyId='rzp_test_fixture';
const user={userId:'user_1',email:'test@example.com'};
const payload=()=>({cart:{sol:1},currency:'INR',requestKey:'checkout-one',details:{email:'receipt@example.com',firstName:'A',lastName:'B',address:'Test street',city:'City',country:'India'}});
const sign=(o,p)=>createHmac('sha256',secret).update(o+'|'+p).digest('hex');
function fixture(){
 let data={...initialCommerce(),revision:0};let count=0;
 const repository={read:async()=>structuredClone(data),transact:async fn=>{const next=await fn(structuredClone(data));data={...next,revision:data.revision+1};return structuredClone(data)}};
 const payment={id:'pay_1',order_id:'order_1',amount:268800,currency:'INR',status:'captured'};
 const gateway={orders:{create:async input=>{count++;return {id:'order_1',...input}},fetchPayments:async()=>({items:[payment]})},payments:{fetch:async()=>payment,capture:async()=>({...payment,status:'captured'})}};
 const payments=createPayments({repository,gateway,keyId,secret,webhookSecret:'hook-secret'});
 return {repository,gateway,payments,payment,get data(){return data},get count(){return count}};
}
test('create calculates price from catalog, enforces paise minimum, and retries without double stock deduction',async()=>{
 const f=fixture();await assert.rejects(f.payments.create({...payload(),amount:99},user),/100 paise/);
 const result=await f.payments.create({...payload(),amount:100,total:1},user);
 assert.equal(result.amount,268800);assert.equal(result.currency,'INR');assert.equal(f.data.products[0].stock,23);
 assert.equal((await f.payments.create(payload(),user)).order_id,result.order_id);assert.equal(f.count,1);assert.equal(f.data.products[0].stock,23);
});
test('missing or forged signature and another user cannot mark an order paid',async()=>{
 const f=fixture();await f.payments.create(payload(),user);
 await assert.rejects(f.payments.verify({},user),/Missing/);
 const body={razorpay_order_id:'order_1',razorpay_payment_id:'pay_1',razorpay_signature:'0'.repeat(64)};
 await assert.rejects(f.payments.verify(body,user),/signature/);
 await assert.rejects(f.payments.verify({...body,razorpay_signature:sign('order_1','pay_1')},{...user,userId:'other'}),/not found/);
 assert.notEqual(f.data.orders[0].paymentStatus,'paid');
});
test('valid HMAC alone cannot approve mismatched amounts, currencies, orders or uncaptured payment',async()=>{
 const f=fixture();await f.payments.create(payload(),user);
 const body={razorpay_order_id:'order_1',razorpay_payment_id:'pay_1',razorpay_signature:sign('order_1','pay_1')};
 for(const change of [{amount:100},{currency:'USD'},{order_id:'another'}]){const previous={...f.payment};Object.assign(f.payment,change);await assert.rejects(f.payments.verify(body,user),/match/);Object.assign(f.payment,previous)}
 f.payment.status='failed';await assert.rejects(f.payments.verify(body,user),/not captured/);assert.notEqual(f.data.orders[0].paymentStatus,'paid');
});
test('captured payment verifies idempotently and authorised payment is captured',async()=>{
 const f=fixture();await f.payments.create(payload(),user);f.payment.status='authorized';
 const body={razorpay_order_id:'order_1',razorpay_payment_id:'pay_1',razorpay_signature:sign('order_1','pay_1')};
 assert.equal((await f.payments.verify(body,user)).order.paymentStatus,'paid');
 await f.payments.verify(body,user);assert.equal(f.data.products[0].stock,23);assert.equal(f.data.orders[0].events.filter(e=>e.text.includes('captured')).length,1);
});
test('provider failure leaves a retryable reservation and maps auth failure to 401',async()=>{
 const f=fixture();f.gateway.orders.create=async()=>{throw {statusCode:401}};
 await assert.rejects(f.payments.create(payload(),user),e=>e.status===401);
 assert.equal(f.data.orders[0].paymentCreatingAt,undefined);assert.equal(f.data.products[0].stock,23);
 f.gateway.orders.create=async input=>({id:'order_1',...input});await f.payments.create(payload(),user);assert.equal(f.data.products[0].stock,23);
});
test('payment status recovery and signed webhook confirm payments without browser callback',async()=>{
 const f=fixture();await f.payments.create(payload(),user);
 const raw=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:f.payment}}}));
 await assert.rejects(f.payments.webhook(raw,'bad'),/signature/);
 const signature=createHmac('sha256','hook-secret').update(raw).digest('hex');await f.payments.webhook(raw,signature);
 assert.equal((await f.payments.status('order_1',user)).paid,true);
});
test('unpaid payment orders cannot be fulfilled and late payment after cancellation requires review',async()=>{
 const f=fixture();await f.payments.create(payload(),user);const order=f.data.orders[0];
 await assert.rejects(f.repository.transact(d=>applyAdminChanges(d,{revision:d.revision,changes:[{resource:'orders',id:order.id,value:{...order,status:'shipped'}}]})),/Verify payment/);
 await f.repository.transact(d=>applyAdminChanges(d,{revision:d.revision,changes:[{resource:'orders',id:order.id,value:{...order,status:'cancelled'}}]}));
 const result=await f.payments.status('order_1',user);assert.equal(result.order.paymentReview,true);assert.equal(result.order.status,'cancelled');
});
test('payment API requires login and returns verified success, public config contains no secret',async()=>{
 const f=fixture();const app=createApp({repository:f.repository,payments:f.payments,origins:[],authenticate:async req=>req.headers.authorization==='Bearer user'?user:null});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 const post=(path,body,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer user'}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/create-order',payload(),false)).status,401);
  assert.equal((await post('/create-order',payload())).status,200);
  assert.equal((await post('/verify-payment',{})).status,400);
  const res=await post('/verify-payment',{razorpay_order_id:'order_1',razorpay_payment_id:'pay_1',razorpay_signature:sign('order_1','pay_1')});assert.equal((await res.json()).success,true);
  const config=await (await fetch(base+'/payment-config')).text();assert.ok(!config.includes(secret));assert.ok(config.includes(keyId));
 }finally{await new Promise(r=>server.close(r))}
});
