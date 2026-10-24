import test from 'node:test';
import assert from 'node:assert/strict';
import {orderProgress,trackingHref,orderAmount} from '../src/orderProgress.js';
import {confirmationMessage,createNotifications} from './notifications.js';
import {applyAdminChanges} from './domain.js';
import {initialCommerce} from '../src/commerceModel.js';
const order={id:'12345678-1234',firstName:'Rahul',lastName:'Test',email:'customer@example.com',paymentStatus:'paid',paymentMode:'live',paymentAmount:1008,paymentCurrency:'INR',paidAt:'2026-10-24T12:00:00.000Z',createdAt:'2026-10-24T12:00:00.000Z',status:'pending',address:'Test address',city:'Mumbai',country:'India',items:[{id:'sol',quantity:1,product:{name:'Solstice'}}],events:[]};
test('paid pending orders display placed, not payment pending; shipping stages and exceptions are accurate',()=>{
 assert.equal(orderProgress(order).title,'Order placed');assert.equal(orderProgress({...order,paymentStatus:'awaiting_payment'}).step,-1);
 assert.equal(orderProgress({...order,status:'processing'}).step,1);assert.equal(orderProgress({...order,status:'shipped'}).step,2);assert.equal(orderProgress({...order,status:'delivered'}).step,3);
 assert.equal(orderProgress({...order,status:'cancelled'}).exception,true);assert.equal(orderProgress({...order,paymentReview:true}).exception,true);assert.equal(orderAmount(order),'₹10.08');
});
test('courier links accept only credential-free HTTPS URLs',()=>{
 assert.equal(trackingHref('javascript:alert(1)'),null);assert.equal(trackingHref('http://example.com'),null);assert.equal(trackingHref('https://user:pass@example.com'),null);assert.equal(trackingHref('https://example.com/track/123'),'https://example.com/track/123');
});
test('admin updates shipment tracking while immutable payment details stay protected',()=>{
 const d={...initialCommerce(),revision:1,orders:[order]};const change={...order,tracking:'AWB123',carrier:'Courier',trackingUrl:'https://example.com/track/AWB123'};
 const next=applyAdminChanges(d,{revision:1,changes:[{resource:'orders',id:order.id,value:change}]});assert.equal(next.orders[0].trackingUrl,change.trackingUrl);
 assert.throws(()=>applyAdminChanges(d,{revision:1,changes:[{resource:'orders',id:order.id,value:{...change,trackingUrl:'javascript:alert(1)'}}]}),/HTTPS/);
 assert.throws(()=>applyAdminChanges(d,{revision:1,changes:[{resource:'orders',id:order.id,value:{...change,paymentStatus:'unpaid'}}]}),/cannot be edited/);
});
test('confirmation uses requested sender, verified account email and escaped product/customer text',()=>{
 const message=confirmationMessage({...order,firstName:'<script>bad</script>'});assert.equal(message.from,'Flamiva <flamiva@everstoneenterprises.co.in>');assert.equal(message.to,order.email);assert.ok(message.text.includes('₹10.08'));assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(!message.html.includes('<script>'));assert.ok(message.text.includes('?view=order&order='));
});
test('email worker is idempotent on normal retries and isolates delivery failures from paid order',async()=>{
 let queued={...order,confirmationEmail:{status:'pending',attempts:0}};let count=0;
 const repository={claimConfirmation:async token=>{if(queued.confirmationEmail.status!=='pending')return null;queued.confirmationEmail={status:'sending',attempts:1,token};return structuredClone(queued)},finishConfirmation:async(id,token,fields)=>{assert.equal(queued.confirmationEmail.token,token);Object.assign(queued.confirmationEmail,fields)}};
 const service=createNotifications({repository,env:{},sendMail:async()=>{count++;return {messageId:'email_1'}}});await service.process();await service.process();assert.equal(count,1);assert.equal(queued.confirmationEmail.status,'sent');
 queued={...order,confirmationEmail:{status:'pending',attempts:0}};const failed=createNotifications({repository,env:{},sendMail:async()=>{throw new Error('mail refused')}});await failed.process();assert.equal(queued.paymentStatus,'paid');assert.equal(queued.confirmationEmail.status,'failed');
});
test('unconfigured mail service never claims orders; Resend carries a stable idempotency key',async()=>{
 let claimed=0,body,headers;const repository={claimConfirmation:async()=>{claimed++;return claimed===1?{...order,confirmationEmail:{attempts:1}}:null},finishConfirmation:async()=>{}};
 const disabled=createNotifications({repository,env:{}});await disabled.process();assert.equal(claimed,0);assert.equal(disabled.config().enabled,false);
 const service=createNotifications({repository,env:{RESEND_API_KEY:'fake-test-key'},fetchImpl:async(url,options)=>{body=JSON.parse(options.body);headers=options.headers;return {ok:true,json:async()=>({id:'email_1'})}}});await service.process();assert.equal(body.from,'Flamiva <flamiva@everstoneenterprises.co.in>');assert.equal(headers['Idempotency-Key'],'order-confirmation/'+order.id);
});
