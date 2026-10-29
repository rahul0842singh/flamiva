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
test('product galleries keep legacy photos and validate cover, image count and sources',()=>{
 const data=initialCommerce();const product={...data.products[0],sku:'gallery-test'};
 assert.doesNotThrow(()=>validateProduct(product,data));
 assert.doesNotThrow(()=>validateProduct({...product,images:[product.image,'data:image/webp;base64,AAAA']},data));
 assert.throws(()=>validateProduct({...product,images:[]},data));
 assert.throws(()=>validateProduct({...product,images:Array(7).fill(product.image)},data));
 assert.throws(()=>validateProduct({...product,images:['/images/other.png']},data));
 assert.throws(()=>validateProduct({...product,images:[product.image,'javascript:alert(1)']},data));
});
test('MRP and dimensions validate without changing the selling price',async()=>{
 const {productDiscount}=await import('./commerceModel.js');
 const data=initialCommerce();const product={...data.products[0],sku:'price-test',price:80,mrp:100,length:4,breadth:4,height:8};
 assert.doesNotThrow(()=>validateProduct(product,data));assert.equal(productDiscount(product),20);assert.equal(product.price,80);
 assert.equal(productDiscount({...product,mrp:80}),0);assert.equal(productDiscount({...product,mrp:undefined}),0);
 assert.throws(()=>validateProduct({...product,mrp:79},data),/MRP/);
 for(const key of ['length','breadth','height'])assert.throws(()=>validateProduct({...product,[key]:-1},data),/Dimensions/);
});
test('flat INR 71 shipping is exact at payment precision',()=>{
 const d=initialCommerce();const settings={...d.settings,shipping:71/84,freeShippingAt:0};
 for(const amount of [33,500,10000]){const totals=totalsFor(amount/84,'',[],settings);assert.equal(Math.round(totals.shipping*84*100),7100);assert.equal(Math.round(totals.total*84*100),amount*100+7100)}
 assert.equal(totalsFor(0,'',[],settings).shipping,0);
});

test('discount matches displayed INR prices despite four-decimal USD conversion',async()=>{
 const {productDiscount}=await import('./commerceModel.js');
 assert.equal(productDiscount({price:2.1429,mrp:2.9762}),28);
 assert.equal(productDiscount({price:1.9048,mrp:2.381}),20);
});

test('four-decimal base prices charge the displayed INR unit price at every quantity',()=>{
 for(const quantity of [1,3,10]){
  const data=initialCommerce();data.products[0].price=.8333;data.settings.shipping=71/84;data.settings.freeShippingAt=0;
  const next=createDemoOrder(data,{sol:quantity},details,'INR','precision-'+quantity);
  assert.equal(Math.round(next.orders[0].subtotal*84*100),7000*quantity);
  assert.equal(Math.round(next.orders[0].total*84*100),7000*quantity+7100);
 }
 const data=initialCommerce();data.products[0].price=.8333;data.settings.shipping=71/84;data.settings.freeShippingAt=0;data.discounts=[{id:'ten',code:'TEN',active:true,type:'percent',value:10,minimum:0,limit:0,used:0}];
 const next=createDemoOrder(data,{sol:10},{...details,coupon:'TEN'},'INR','precision-discount');
 assert.equal(Math.round(next.orders[0].discount*84*100),7000);assert.equal(Math.round(next.orders[0].total*84*100),70100);
});
