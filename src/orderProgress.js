export function orderProgress(order){
 if(order.paymentReview)return {title:'Order needs review',step:-1,exception:true,description:'Payment was received after cancellation. Please contact Flamiva.'};
 if(order.status==='cancelled')return {title:'Order cancelled',step:-1,exception:true,description:order.paymentStatus==='paid'?'Contact Flamiva about refund status.':'This order has been cancelled.'};
 if(order.status==='returned')return {title:'Order returned',step:-1,exception:true,description:'Contact Flamiva about return and refund details.'};
 if(order.paymentStatus!=='paid')return {title:'Awaiting payment',step:-1,description:'Your order will be confirmed after payment is verified.'};
 return {title:({pending:'Order placed',processing:'Preparing your order',shipped:'Shipped',delivered:'Delivered'})[order.status]||'Order placed',step:({pending:0,processing:1,shipped:2,delivered:3})[order.status]??0,description:order.paymentMode==='test'?'Test order — no live shipment is created.':({pending:'Payment received. We will prepare your candles next.',processing:'Your candles are being prepared for dispatch.',shipped:'Your parcel has been handed to the courier.',delivered:'Your parcel has been marked delivered.'})[order.status]||'Payment received.'};
}
export function trackingHref(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function orderAmount(order){return order.paymentAmount!=null?new Intl.NumberFormat('en-IN',{style:'currency',currency:order.paymentCurrency||'INR'}).format(order.paymentAmount/100):null}
