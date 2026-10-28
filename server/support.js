import {fail} from './domain.js';
export function validateSupport(body={}){
 const {name,email,message,requestKey,website}=body||{};
 if(website)fail('Unable to send this message.');
 if(typeof name!=='string'||!name.trim()||name.length>100||/[\r\n]/.test(name))fail('Enter your name (up to 100 characters).');
 if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))fail('Enter a valid email address.');
 if(typeof message!=='string'||message.trim().length<10||message.length>3000)fail('Enter a message between 10 and 3,000 characters.');
 if(typeof requestKey!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey))fail('Invalid message reference.');
 return {name:name.trim(),email:email.trim().toLowerCase(),message:message.trim(),requestKey};
}
