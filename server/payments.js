import {createHmac,timingSafeEqual} from 'node:crypto';
import {placeOrder,fail} from './domain.js';
import {currencies} from '../src/commerceModel.js';

export function signatureMatches(message,signature,secret){
 if(typeof signature!=='string'||! /^[a-f0-9]{64}$/i.test(signature)||!secret)return false;
 const expected=createHmac('sha256',secret).update(message).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function createPayments({repository,gateway,keyId,secret,webhookSecret,notifications}){
 const enabled=Boolean(gateway&&keyId&&secret);
 const requireGateway=()=>{if(!enabled)fail('Payments are not configured yet. Please contact Flamiva.',503)};
 const find=async(id,identity)=>{const state=await repository.read();const order=state.orders.find(o=>o.razorpayOrderId===id);if(!order||identity&&order.userId!==identity.userId)fail('Payment order not found.',404);return order};
 const gatewayCall=async fn=>{let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Payment provider timed out')),20000)})])}catch(e){if(e.statusCode===401)fail('Payment provider authentication failed. Contact Flamiva.',401);fail('Unable to reach Razorpay. Please retry.',500)}finally{clearTimeout(timer)}};
 function validatePayment(order,payment){
  if(payment.order_id!==order.razorpayOrderId||Number(payment.amount)!==order.paymentAmount||payment.currency!==order.paymentCurrency)fail('Payment details do not match this order.',400);
 }
 async function reconcile(id,identity,paymentId){
  requireGateway();const order=await find(id,identity);
  let payment;
  if(paymentId){payment=await gatewayCall(()=>gateway.payments.fetch(paymentId));if(payment.id!==paymentId)fail('Payment ID mismatch.',400);}
  else{const list=await gatewayCall(()=>gateway.orders.fetchPayments(id));payment=list.items?.find(p=>p.status==='captured')||list.items?.find(p=>p.status==='authorized')}
  if(!payment)return {order,paid:false};
  validatePayment(order,payment);
  if(payment.status==='authorized'){
   payment=await gatewayCall(()=>gateway.payments.capture(payment.id,order.paymentAmount,order.paymentCurrency));validatePayment(order,payment);
  }
  if(payment.status!=='captured')return {order,paid:false};
  const state=await repository.transact(d=>{
   const saved=d.orders.find(o=>o.id===order.id);
   if(saved.paymentStatus==='paid'){if(saved.razorpayPaymentId!==payment.id)fail('Order already has a different payment.',409);return d}
   if(saved.razorpayOrderId!==id)fail('Payment order changed.',409);
   // Never silently fulfil an order whose reservation was released by an administrator.
   const review=saved.restocked||['cancelled','returned'].includes(saved.status);
   Object.assign(saved,{paymentStatus:'paid',paymentReview:review,razorpayPaymentId:payment.id,paidAt:new Date().toISOString()});
   if(!review&&saved.paymentMode!=='test')saved.confirmationEmail={status:'pending',attempts:0,nextAttemptAt:saved.paidAt};
   saved.events.push({at:saved.paidAt,text:review?'Payment captured after cancellation; manual review/refund required.':'Razorpay payment captured and verified.'});
   return d;
  });
  if(notifications)void notifications.process().catch(()=>console.error('Confirmation email worker failed'));
  return {order:state.orders.find(o=>o.id===order.id),paid:true};
 }
 return {
  config:()=>({enabled,key_id:enabled?keyId:null,mode:keyId?.startsWith('rzp_live_')?'live':'test',currency:'INR'}),
  async create(payload,identity){
   requireGateway();
   if(payload.amount!==undefined&&(!Number.isSafeInteger(payload.amount)||payload.amount<100))fail('Minimum payment amount is 100 paise.');
   if(payload.currency&&payload.currency!=='INR')fail('Checkout payments are charged in INR.');
   if(!payload.requestKey||typeof payload.requestKey!=='string'||payload.requestKey.length>100)fail('Invalid checkout reference.');
   const state=await repository.transact(d=>{
    const next=placeOrder(d,{...payload,currency:'INR'},identity);
    const o=next.orders.find(o=>o.userId===identity.userId&&o.requestKey===payload.requestKey);
    if(o.status!=='pending'||o.restocked)fail('This order cannot accept a payment.',409);
    if(o.paymentStatus==='paid')return next;
    if(!o.razorpayOrderId){
     if(o.paymentCreatingAt&&Date.now()-Date.parse(o.paymentCreatingAt)<45000)fail('Payment is being prepared. Please retry shortly.',409);
     const amount=Math.round(o.total*currencies.INR.rate*100);
     if(!Number.isSafeInteger(amount)||amount<100)fail('Minimum payment amount is 100 paise.');
     Object.assign(o,{paymentAmount:amount,paymentCurrency:'INR',paymentStatus:'awaiting_payment',paymentCreatingAt:new Date().toISOString(),paymentMode:keyId.startsWith('rzp_live_')?'live':'test'});
    }
    return next;
   });
   let order=state.orders.find(o=>o.userId===identity.userId&&o.requestKey===payload.requestKey);
   if(order.paymentStatus==='paid')return {paid:true,order};
   if(!order.razorpayOrderId){
    try{
     const external=await gatewayCall(()=>gateway.orders.create({amount:order.paymentAmount,currency:'INR',receipt:order.id,notes:{store_order_id:order.id}}));
     if(!external.id||Number(external.amount)!==order.paymentAmount||external.currency!=='INR')fail('Invalid payment provider response.',500);
     const saved=await repository.transact(d=>{const o=d.orders.find(o=>o.id===order.id);if(o.status!=='pending'||o.restocked)fail('Order is no longer payable.',409);if(!o.razorpayOrderId)o.razorpayOrderId=external.id;delete o.paymentCreatingAt;return d});
     order=saved.orders.find(o=>o.id===order.id);
    }catch(e){await repository.transact(d=>{const o=d.orders.find(o=>o.id===order.id);delete o.paymentCreatingAt;return d});throw e}
   }
   return {order_id:order.razorpayOrderId,store_order_id:order.id,amount:order.paymentAmount,currency:'INR',key_id:keyId,mode:order.paymentMode};
  },
  async verify(body,identity){
   requireGateway();
   for(const key of ['razorpay_order_id','razorpay_payment_id','razorpay_signature'])if(typeof body[key]!=='string'||!body[key]||body[key].length>200)fail('Missing or invalid payment fields.');
   const order=await find(body.razorpay_order_id,identity);
   // Use the stored order ID, never an unbound client order ID, when computing HMAC.
   if(!signatureMatches(order.razorpayOrderId+'|'+body.razorpay_payment_id,body.razorpay_signature,secret))fail('Payment signature verification failed.',400);
   const result=await reconcile(order.razorpayOrderId,identity,body.razorpay_payment_id);
   if(!result.paid)fail('Payment is not captured yet. Check its status before trying another payment.',409);
   return {success:true,order:result.order};
  },
  async status(id,identity){return reconcile(id,identity)},
  async webhook(raw,signature){
   if(!webhookSecret)fail('Webhook is not configured.',503);
   if(!signatureMatches(raw,signature,webhookSecret))fail('Invalid webhook signature.',400);
   let event;try{event=JSON.parse(raw.toString('utf8'))}catch{fail('Invalid webhook body.')}
   if(['payment.captured','order.paid'].includes(event.event)){
    const payment=event.payload?.payment?.entity;
    if(payment?.order_id&&payment?.id)await reconcile(payment.order_id,null,payment.id);
   }
   return {received:true};
  }
 };
}

