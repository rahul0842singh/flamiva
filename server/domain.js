import {createDemoOrder,changeOrderStatus,validateProduct,currencies} from '../src/commerceModel.js';
import {randomUUID} from 'node:crypto';
export const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=160)=>typeof v==='string'&&v.length<=max;
export function validateState(d){
 for(const key of ['products','categories','orders','customers','discounts','activity'])if(!Array.isArray(d[key])||d[key].length>20000)fail('Invalid store data.');
 for(const key of ['products','categories','orders','customers','discounts']){const ids=new Set();for(const item of d[key]){if(!plain(item)||!text(item.id,100)||!item.id||ids.has(item.id))fail('Invalid or duplicate record ID.');ids.add(item.id)}}
 const categoryNames=new Set();for(const c of d.categories){if(!text(c.name,80)||!c.name.trim()||['all','saved'].includes(c.name.toLowerCase())||categoryNames.has(c.name.toLowerCase()))fail('Invalid category.');categoryNames.add(c.name.toLowerCase())}
 for(const p of d.products){for(const k of ['name','sku','family','notes','label','burnTime','waxType','color','fragrance'])if(p[k]!==undefined&&!text(p[k],160))fail('Invalid product field.');if(!text(p.description,1200)||!text(p.image,500000)||!['active','draft','archived'].includes(p.status))fail('Invalid product.');validateProduct(p,d)}
 const codes=new Set();for(const p of d.discounts){if(!text(p.code,40)||!p.code||codes.has(p.code)||!['percent','fixed'].includes(p.type)||!Number.isFinite(p.value)||p.value<=0||p.type==='percent'&&p.value>100||!Number.isFinite(p.minimum)||p.minimum<0||!Number.isInteger(p.used)||p.used<0||!Number.isInteger(p.limit)||p.limit<0||typeof p.active!=='boolean'||p.expires&&!/^\d{4}-\d{2}-\d{2}$/.test(p.expires))fail('Invalid discount.');codes.add(p.code)}
 for(const c of d.customers)if(!text(c.name,160)||!text(c.email,254)||!/^\S+@\S+\.\S+$/.test(c.email)||!['active','archived'].includes(c.status))fail('Invalid customer.');
 const s=d.settings;if(s?.whatsappNumber!==undefined&&!/^[1-9][0-9]{7,14}$/.test(s.whatsappNumber))fail('Enter a WhatsApp number with country code.');if(!plain(s)||!text(s.storeName,50)||!s.storeName.trim()||!text(s.announcement,120)||!text(s.supportEmail,254)||!currencies[s.adminCurrency]||!['shipping','freeShippingAt','taxPercent'].every(k=>Number.isFinite(s[k])&&s[k]>=0)||s.taxPercent>100)fail('Invalid store settings.');return d;
}
export function applyAdminChanges(current,payload){
 if(payload.revision!==current.revision)fail('Store changed since this page loaded. Refresh and try again.',409);
 if(!Array.isArray(payload.changes)||payload.changes.length>1000)fail('Invalid changes.');let next=structuredClone(current);
 for(const change of payload.changes){if(!plain(change)||!['products','categories','customers','discounts','settings','orders','activity'].includes(change.resource))fail('Unknown resource.');const {resource,id,value}=change;
 if(resource==='settings'){if(!plain(value))fail('Invalid settings.');next.settings=value;continue}
 const previous=next[resource].find(x=>x.id===id);
 if(resource==='activity'&&value!==null)fail('Activity records cannot be edited.');
 if(resource==='orders'){if(!previous||!plain(value))fail('Orders cannot be created or deleted by admin edits.');if(previous.paymentAmount&&previous.paymentStatus!=='paid'&&['processing','shipped','delivered'].includes(value.status))fail('Verify payment before fulfilling this order.');if(value.status!==previous.status)next=changeOrderStatus(next,id,value.status);const allowed=['adminDeleted','status','tracking','trackingUrl','carrier','note','events','restocked'];for(const key of Object.keys(previous))if(!allowed.includes(key)&&JSON.stringify(previous[key])!==JSON.stringify(value[key]))fail('Order amounts, customer and items cannot be edited.');if(value.trackingUrl){let url;try{url=new URL(value.trackingUrl)}catch{fail('Enter a valid HTTPS courier tracking URL.')}if(url.protocol!=='https:'||url.username||url.password)fail('Enter a valid HTTPS courier tracking URL.');}for(const key of ['tracking','trackingUrl','carrier','note'])if(value[key]!==undefined&&!text(value[key],1200))fail('Invalid order field.');if(value.adminDeleted!==undefined&&typeof value.adminDeleted!=='boolean')fail('Invalid order deletion.');next.orders=next.orders.map(o=>o.id===id?{...o,adminDeleted:value.adminDeleted||false,tracking:value.tracking||'',trackingUrl:value.trackingUrl||'',carrier:value.carrier||'',note:value.note||''}:o);continue}
 if(value===null){if(!previous)fail('Record not found.');if(resource==='categories'&&next.products.some(p=>p.family===previous.name))fail('Move products out of this category first.');next[resource]=next[resource].filter(x=>x.id!==id);continue}
 if(!plain(value)||value.id!==id)fail('Invalid record.');if(resource==='products')value.createdAt=previous?previous.createdAt:new Date().toISOString();if(resource==='discounts'&&value.used!==(previous?.used||0))fail('Discount usage is server managed.');if(resource==='customers'&&previous?.userId!==value.userId)fail('Customer account identity cannot be changed.');next[resource]=previous?next[resource].map(x=>x.id===id?value:x):[value,...next[resource]];
 }
 next.activity=[{id:randomUUID(),text:text(payload.message,300)?payload.message:'Admin updated store',at:new Date().toISOString()},...next.activity].slice(0,200);return validateState(next);
}
export function placeOrder(current,payload,identity){
 if(!plain(payload.cart)||Object.keys(payload.cart).length>100||!currencies[payload.currency]||!text(payload.requestKey,100)||!payload.requestKey)fail('Invalid order.');
 for(const quantity of Object.values(payload.cart))if(!Number.isInteger(quantity)||quantity<1||quantity>99)fail('Invalid quantity.');
 const previous=current.orders.find(o=>o.userId===identity.userId&&o.requestKey===payload.requestKey);if(previous)return current;
 const f=payload.details;if(!plain(f))fail('Delivery details are required.');const details={};for(const key of ['firstName','lastName','phone','address','city','region','postal','country','coupon']){if(f[key]!==undefined&&!text(f[key],200))fail('Invalid delivery details.');details[key]=f[key]||''}
 for(const key of ['firstName','lastName','address','city','country'])if(!details[key].trim())fail('Complete your delivery address.');details.email=identity.email;
 const next=createDemoOrder(current,payload.cart,details,payload.currency,randomUUID());const o=next.orders[0];Object.assign(o,{userId:identity.userId,requestKey:payload.requestKey,paymentStatus:'unpaid',events:[{at:o.createdAt,text:'Order request received. Payment not collected.'}]});const customer=next.customers.find(c=>c.email===identity.email);customer.userId=identity.userId;return next;
}
export function publicState(d){return {version:1,revision:d.revision,products:d.products.filter(p=>p.status==='active'),categories:d.categories,discounts:d.discounts.filter(p=>p.active).map(({id,code,type,value,minimum,expires,limit,used,active})=>({id,code,type,value,minimum,expires,limit,used,active})),settings:d.settings,orders:[],customers:[],activity:[]}}

