import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function confirmationMessage(order,{from='flamiva@everstoneenterprises.co.in',siteUrl='https://flamiva.in'}={}){
 const reference=order.id.slice(0,8).toUpperCase();
 const amount=new Intl.NumberFormat('en-IN',{style:'currency',currency:order.paymentCurrency||'INR'}).format(order.paymentAmount/100);
 const url=siteUrl+'/?view=order&order='+encodeURIComponent(order.id);
 const lines=order.items.map(i=>(i.product?.name||'Candle')+' × '+i.quantity);
 const address=[order.firstName+' '+order.lastName,order.address,order.city,order.region,order.postal,order.country].filter(Boolean);
 return {from:'Flamiva <'+from+'>',to:order.email,subject:'Your Flamiva order #'+reference+' is confirmed',messageId:'<order-'+order.id+'@'+from.split('@')[1]+'>',
  text:['Thank you, '+order.firstName+'.','Your payment of '+amount+' has been received.','Order #'+reference,...lines,'Delivery address:',...address,'Track your order (sign in required): '+url,'We will update your order when it ships.','Questions? Reply to this email.','Flamiva'].join('\n'),
  html:'<div style="font-family:Arial,sans-serif;color:#30372b;max-width:600px;margin:auto;padding:32px"><h1>Flamiva</h1><h2>Thank you, '+escape(order.firstName)+'.</h2><p>Your order <strong>#'+reference+'</strong> is confirmed.</p><p>Payment received: <strong>'+amount+'</strong></p><ul>'+lines.map(line=>'<li>'+escape(line)+'</li>').join('')+'</ul><h3>Delivery address</h3><p>'+address.map(escape).join('<br>')+'</p><p><a style="display:inline-block;padding:14px 20px;background:#353d30;color:#fff;text-decoration:none;border-radius:5px" href="'+escape(url)+'">View order &amp; tracking</a></p><p>Sign in to view your order. We will update its progress when it ships.</p><p>Questions? Reply to this email.</p></div>'};
}
export function createNotifications({repository,env=process.env,fetchImpl=fetch,sendMail}){
 const from=env.MAIL_FROM||'flamiva@everstoneenterprises.co.in';const siteUrl='https://flamiva.in';
 const smtpReady=Boolean(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASS);
 const enabled=Boolean(sendMail||env.RESEND_API_KEY||smtpReady);
 const transporter=smtpReady?nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:String(env.SMTP_SECURE)==='true'||Number(env.SMTP_PORT)===465,requireTLS:Number(env.SMTP_PORT)!==465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000}):null;
 let running=false;
 async function send(order){
  const message=confirmationMessage(order,{from,siteUrl});
  if(sendMail)return sendMail(message);
  if(env.RESEND_API_KEY){
   const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'order-confirmation/'+order.id},body:JSON.stringify({from:message.from,to:[message.to],subject:message.subject,html:message.html,text:message.text,reply_to:from})});
   const result=await response.json();if(!response.ok)throw new Error('Email provider rejected request');return {messageId:result.id};
  }
  const result=await transporter.sendMail(message);if(!result.accepted?.length)throw new Error('Email recipient not accepted');return result;
 }
 return {
  config:()=>({enabled,from,provider:env.RESEND_API_KEY?'resend':smtpReady?'smtp':'not-configured'}),
  async process(){
   if(!enabled||running||!repository.claimConfirmation)return;running=true;
   try{for(let i=0;i<10;i++){
    const token=randomUUID();const order=await repository.claimConfirmation(token);if(!order)break;
    try{const result=await send(order);await repository.finishConfirmation(order.id,token,{status:'sent',sentAt:new Date().toISOString(),providerId:result.messageId||''})}
    catch{await repository.finishConfirmation(order.id,token,{status:'failed',lastError:'Email delivery failed. Check provider configuration.',nextAttemptAt:new Date(Date.now()+60000*Math.min(order.confirmationEmail.attempts,5)).toISOString()})}
   }}finally{running=false}
  }
 };
}
