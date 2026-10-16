export const bulkStatuses=['new','contacted','quoted','confirmed','closed'];
export function validateBulk(input){
 const result={};
 for(const [key,max] of Object.entries({Name:100,Company:150,Email:254,Phone:30,Occasion:80,'Delivery location':180,'Preferred date':10,Requirements:1500})){
  if(input[key]!==undefined&&typeof input[key]!=='string')throw new Error('Invalid enquiry field.');
  result[key]=(input[key]||'').trim();if(result[key].length>max)throw new Error('Enquiry field is too long.');
 }
 if(!result.Name||!result['Delivery location']||!result.Occasion)throw new Error('Complete your name, occasion and delivery location.');
 if(!/^\S+@\S+\.\S+$/.test(result.Email))throw new Error('Enter a valid email address.');
 if(!/^[+\d ()-]{7,30}$/.test(result.Phone))throw new Error('Enter a contact phone number.');
 result.Quantity=Number(input.Quantity);if(!Number.isInteger(result.Quantity)||result.Quantity<1||result.Quantity>100000)throw new Error('Enter a valid whole-number quantity.');
 return result;
}
