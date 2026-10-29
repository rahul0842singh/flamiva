import test from 'node:test';import assert from 'node:assert/strict';
import {publicProductImages,readProductImage} from './productImages.js';
test('public catalog replaces embedded photos with versioned URLs without changing stored photos',()=>{
 const p={id:'candle',image:'data:image/png;base64,aGVsbG8=',images:['data:image/png;base64,aGVsbG8=','https://example.com/photo.jpg']};const result=publicProductImages(p);
 assert.equal(result.image,result.images[0]);assert.ok(result.image.startsWith('/api/product-images/candle/0/'));assert.equal(result.images[1],p.images[1]);assert.ok(p.image.startsWith('data:'));
 const hash=result.image.split('/').at(-1);assert.equal(readProductImage(p,'0',hash).bytes.toString(),'hello');assert.equal(readProductImage(p,'0','wrong'),null);assert.equal(readProductImage(null,'0',hash),null);assert.equal(readProductImage(p,'9',hash),null);
 const changed={...p,images:['data:image/png;base64,d29ybGQ=']};assert.notEqual(publicProductImages(changed).image,result.image);assert.equal(readProductImage(changed,'0',hash),null);
});
