export const currencies={USD:{rate:1,country:'United States'},INR:{rate:84,country:'India'},EUR:{rate:.92,country:'Europe'},GBP:{rate:.78,country:'United Kingdom'},CAD:{rate:1.36,country:'Canada'},AUD:{rate:1.52,country:'Australia'},AED:{rate:3.67,country:'United Arab Emirates'},SGD:{rate:1.34,country:'Singapore'}};
export const seedProducts=[
 {id:'sol',name:'Solstice',family:'Woody',price:32,image:'/images/solstice.png',notes:'Sandalwood · Amber · Vetiver',label:'Bestseller',description:'A grounding blend of soft sandalwood and glowing amber, made for the hour when the day slows down.',stock:24},
 {id:'cloud',name:'Cloud Nine',family:'Fresh',price:28,image:'/images/cloud-nine.png',notes:'White tea · Cotton · Musk',label:'Sculptural',description:'Airy white tea and clean cotton, captured in a sculptural shape that looks lovely even unlit.',stock:18},
 {id:'moss',name:'Into the Woods',family:'Woody',price:36,image:'/images/into-the-woods.png',notes:'Cedar · Moss · Rain',label:'Earthy',description:'Earthy moss and deep cedar recall a quiet walk through the woods after rain.',stock:7},
 {id:'rose',name:'Petal Theory',family:'Floral',price:30,image:'/images/petal-theory.png',notes:'Rose · Fig · Green leaves',label:'Floral',description:'Soft rose meets green fig in a sculptural candle inspired by sunlit gardens.',stock:12},
 {id:'citrus',name:'Sunday Kind',family:'Fresh',price:30,image:'/images/sunday-kind.png',notes:'Bergamot · Neroli · Citrus',label:'Bright',description:'Bright bergamot and gentle neroli bring the feeling of an unhurried Sunday.',stock:4},
 {id:'dusk',name:'After Hours',family:'Warm',price:38,image:'/images/after-hours.png',notes:'Vanilla · Smoke · Tonka',label:'Evening',description:'Rich vanilla and a whisper of smoke for slow evenings and very good books.',stock:16}
].map(p=>({...p,sku:`EE-${p.id.toUpperCase()}`,status:'active',lowStock:5}));
export const defaultSettings={storeName:'Flamiva',whatsappNumber:'',supportEmail:'',announcement:'',shipping:0,freeShippingAt:100,taxPercent:0,adminCurrency:'INR'};
export const orderStatuses=['pending','processing','shipped','delivered','cancelled','returned'];
export const transitions={pending:['processing','cancelled'],processing:['shipped','cancelled'],shipped:['delivered','returned'],delivered:['returned'],cancelled:[],returned:[]};
export function initialCommerce(legacyOrders=[]){return {version:1,products:seedProducts.map(p=>({...p})),categories:['Woody','Fresh','Floral','Warm'].map((name,i)=>({id:`cat-${i}`,name,description:{Woody:'Grounding woods and earthy notes.',Fresh:'Clean, bright, everyday scents.',Floral:'Soft petals and green gardens.',Warm:'Comforting scents for slow evenings.'}[name]})),orders:legacyOrders.filter(o=>o?.id&&Array.isArray(o.items)&&currencies[o.currency]).map(o=>({...o,status:o.status||'pending',stockDeducted:false,items:o.items.map(i=>({...i,product:i.product||seedProducts.find(p=>p.id===i.id)})).filter(i=>i.product),total:o.total??o.subtotal,events:[{at:o.createdAt,text:'Imported browser demo order'}]})),customers:[],discounts:[],activity:[],settings:{...defaultSettings}}}
const rounded=n=>Math.round(n*100)/100;
export function totalsFor(subtotal,code,discounts,settings,now=Date.now()){
 const normalized=String(code||'').trim().toUpperCase();
 const promotion=discounts.find(d=>d.code===normalized);
 let error='';let discount=0;
 if(normalized){
  if(!promotion||!promotion.active)error='This discount code is not active.';
  else if(promotion.expires&&new Date(promotion.expires+'T23:59:59').getTime()<now)error='This discount code has expired.';
  else if(promotion.limit>0&&promotion.used>=promotion.limit)error='This discount has reached its usage limit.';
  else if(subtotal<promotion.minimum)error='Your order does not meet this code’s minimum spend.';
  else discount=Math.min(subtotal,promotion.type==='percent'?subtotal*promotion.value/100:promotion.value);
 }
 discount=rounded(discount);
 const shipping=subtotal===0||settings.freeShippingAt>0&&subtotal>=settings.freeShippingAt?0:Number(settings.shipping)||0;
 const tax=rounded(Math.max(0,subtotal-discount)*(Number(settings.taxPercent)||0)/100);
 return {subtotal,discount,shipping,tax,total:Math.round((subtotal-discount+shipping+tax)*currencies.INR.rate*100)/(currencies.INR.rate*100),code:error?'':normalized,error};
}
export function createDemoOrder(data,cart,details,currency,id,createdAt=new Date().toISOString()){
 const entries=Object.entries(cart).filter(([,q])=>q>0);
 if(!entries.length)throw new Error('Your bag is empty.');
 const items=entries.map(([pid,quantity])=>{
  const product=data.products.find(p=>p.id===pid&&p.status==='active');
  if(!product||!Number.isInteger(quantity)||quantity>product.stock)throw new Error(`${product?.name||'A product'} is no longer available in that quantity. Please update your bag.`);
  return {id:pid,quantity,product:{...product}};
 });
 const subtotal=rounded(items.reduce((s,i)=>s+i.product.price*i.quantity,0));
 const totals=totalsFor(subtotal,details.coupon,data.discounts,data.settings);
 if(totals.error)throw new Error(totals.error);
 const email=details.email.trim().toLowerCase();
 const order={...details,...totals,email,id,createdAt,currency,items,status:'pending',stockDeducted:true,restocked:false,note:'',tracking:'',events:[{at:createdAt,text:'Demo order placed. No payment collected.'}]};
 const customer=data.customers.find(c=>c.email.toLowerCase()===email);
 return {...data,products:data.products.map(p=>({...p,stock:p.stock-(items.find(i=>i.id===p.id)?.quantity||0)})),orders:[order,...data.orders],customers:customer?data.customers:[{id:`customer-${id}`,name:`${details.firstName} ${details.lastName}`,email,phone:details.phone||'',notes:'',status:'active',createdAt},...data.customers],discounts:data.discounts.map(d=>d.code===totals.code?{...d,used:(d.used||0)+1}:d)};
}
export function changeOrderStatus(data,id,status){
 const order=data.orders.find(o=>o.id===id);if(!order)throw new Error('Order no longer exists.');
 const previous=order.status||'pending';if(previous===status)return data;
 if(!(transitions[previous]||[]).includes(status))throw new Error('This order status change is not allowed.');
 const restock=['cancelled','returned'].includes(status)&&order.stockDeducted&&!order.restocked;
 return {...data,products:restock?data.products.map(p=>({...p,stock:p.stock+(order.items.find(i=>i.id===p.id)?.quantity||0)})):data.products,orders:data.orders.map(o=>o.id===id?{...o,status,restocked:o.restocked||restock,events:[...(o.events||[]),{at:new Date().toISOString(),text:`Marked ${status}${restock?' · Stock restored':''}`}]}:o)};
}
export function validateProduct(product,data){
 if(!product.name.trim()||!product.sku.trim())throw new Error('Product name and SKU are required.');
 if(!data.categories.some(c=>c.name===product.family))throw new Error('Choose a valid category.');
 if(data.products.some(p=>p.id!==product.id&&p.sku.toLowerCase()===product.sku.toLowerCase()))throw new Error('This SKU is already in use.');
 if(!Number.isFinite(product.price)||product.price<=0)throw new Error('Enter a price greater than zero.');
 if(product.mrp!==undefined&&(!Number.isFinite(product.mrp)||product.mrp<product.price))throw new Error('MRP must be at least the selling price.');
 for(const key of ['length','breadth','height'])if(product[key]!==undefined&&(!Number.isFinite(product[key])||product[key]<=0||product[key]>10000))throw new Error('Dimensions must be positive numbers in centimetres.');
 if(!Number.isInteger(product.stock)||product.stock<0||!Number.isInteger(product.lowStock)||product.lowStock<0)throw new Error('Stock and threshold must be non-negative whole numbers.');
 if(product.images!==undefined&&(!Array.isArray(product.images)||product.images.length<1||product.images.length>6||product.images[0]!==product.image||product.images.some(image=>typeof image!=='string'||image.length>500000||!/^(\/images\/|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(image))))throw new Error('Choose 1 to 6 valid product images with the cover photo first.');
 if(!/^(\/images\/|https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(product.image))throw new Error('Use a library image, an uploaded photo, or an HTTPS image URL.');
 return product;
}


export function productDiscount(product){return Number.isFinite(product.mrp)&&product.mrp>product.price?Math.floor((product.mrp-product.price)/product.mrp*100):0}
