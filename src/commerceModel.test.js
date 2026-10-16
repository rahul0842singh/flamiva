import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCommerce,createDemoOrder,changeOrderStatus,totalsFor,validateProduct} from './commerceModel.js';
const details={email:'TEST@example.com',firstName:'Test',lastName:'Customer',address:'Demo address',country:'India'};
test('checkout snapshots items, captures customer, and deducts exact stock',()=>{
 const before=initialCommerce();const after=createDemoOrder(before,{sol:2},details,'INR','test');
 assert.equal(after.products[0].stock,22);assert.equal(before.products[0].stock,24);
 assert.equal(after.orders[0].total,64);assert.equal(after.customers[0].email,'test@example.com');
 after.products[0].price=100;assert.equal(after.orders[0].items[0].product.price,32);
});
test('checkout rejects overselling, archived products, and fractional quantities',()=>{
 const data=initialCommerce();assert.throws(()=>createDemoOrder(data,{sol:25},details,'INR','test'),/quantity/);
 assert.throws(()=>createDemoOrder(data,{sol:1.5},details,'INR','test'),/quantity/);
 data.products[0].status='archived';assert.throws(()=>createDemoOrder(data,{sol:1},details,'INR','test'),/quantity/);
});
test('cancellation restores stock once and cannot be reopened without a new order',()=>{
 const placed=createDemoOrder(initialCommerce(),{sol:2},details,'INR','test');
 const cancelled=changeOrderStatus(placed,'test','cancelled');assert.equal(cancelled.products[0].stock,24);
 assert.equal(changeOrderStatus(cancelled,'test','cancelled').products[0].stock,24);
 assert.throws(()=>changeOrderStatus(cancelled,'test','processing'),/not allowed/);
});
test('delivery and return follow valid transitions and restore inventory',()=>{
 let d=createDemoOrder(initialCommerce(),{cloud:3},details,'USD','test');
 assert.throws(()=>changeOrderStatus(d,'test','delivered'),/not allowed/);
 for(const s of ['processing','shipped','delivered','returned'])d=changeOrderStatus(d,'test',s);
 assert.equal(d.products.find(p=>p.id==='cloud').stock,18);assert.equal(d.orders[0].events.length,5);
});
test('discounts enforce minimum, expiry, limits, and calculate shipping and tax',()=>{
 const settings={shipping:5,freeShippingAt:100,taxPercent:10};
 const discount={code:'SAVE10',active:true,type:'percent',value:10,minimum:30,used:0,limit:1};
 const totals=totalsFor(50,' save10 ',[discount],settings);assert.equal(totals.total,54.5);
 assert.match(totalsFor(20,'SAVE10',[discount],settings).error,/minimum/);
 assert.match(totalsFor(50,'SAVE10',[{...discount,used:1}],settings).error,/limit/);
 assert.match(totalsFor(50,'SAVE10',[{...discount,expires:'2000-01-01'}],settings).error,/expired/);
 assert.equal(totalsFor(100,'',[discount],settings).shipping,0);
 assert.equal(totalsFor(20,'FIX',[{code:'FIX',active:true,type:'fixed',value:50,minimum:0,limit:0}],settings).discount,20);
});
test('order consumes coupon once and a repeat order upserts the existing customer',()=>{
 const d=initialCommerce();d.discounts=[{code:'ONE',active:true,type:'percent',value:10,minimum:0,limit:1,used:0}];
 const after=createDemoOrder(d,{sol:1},{...details,coupon:'ONE'},'INR','a');
 assert.equal(after.discounts[0].used,1);assert.throws(()=>createDemoOrder(after,{sol:1},{...details,coupon:'ONE'},'INR','b'),/limit/);
 assert.equal(createDemoOrder(after,{sol:1},details,'INR','c').customers.length,1);
});
test('product validation rejects duplicate SKUs, invalid categories and negative stock',()=>{
 const data=initialCommerce();const product={...data.products[0],id:'new'};
 assert.throws(()=>validateProduct(product,data),/SKU/);
 assert.throws(()=>validateProduct({...product,sku:'unique',family:'Missing'},data),/category/);
 assert.throws(()=>validateProduct({...product,sku:'unique',stock:-1},data),/Stock/);
});
test('legacy order migration retains item details but does not restock untracked orders',()=>{
 const d=initialCommerce([{id:'old',createdAt:new Date().toISOString(),subtotal:32,currency:'INR',items:[{id:'sol',quantity:1}]}]);
 assert.equal(d.orders[0].items[0].product.name,'Solstice');
 assert.equal(changeOrderStatus(d,'old','cancelled').products[0].stock,24);
});
