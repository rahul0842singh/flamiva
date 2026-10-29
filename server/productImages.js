import {createHash} from 'node:crypto';
const inline=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const photos=product=>product.images?.length?product.images:[product.image];
export function publicProductImages(product,baseUrl=''){
 const images=photos(product).map((image,index)=>inline.test(image)?`${baseUrl}/api/product-images/${encodeURIComponent(product.id)}/${index}/${digest(image)}`:image);
 return {...product,image:images[0],images};
}
export function readProductImage(product,index,hash){
 if(!product||!/^\d$/.test(index))return null;
 const image=photos(product)[Number(index)];if(typeof image!=='string'||digest(image)!==hash)return null;
 const match=image.match(inline);if(!match)return null;
 return {type:'image/'+match[1],bytes:Buffer.from(match[2],'base64')};
}
