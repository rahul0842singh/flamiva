import {validateBulk,bulkStatuses} from '../src/bulkModel.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {applyAdminChanges,placeOrder,publicState,fail} from './domain.js';
export function createApp({repository,authenticate,origins}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);app.use(helmet());app.use(cors({origin:(origin,done)=>done(null,!origin||origins.includes(origin))}));app.use(express.json({limit:'2mb'}));app.use('/api',rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 app.get('/api/health',async(req,res)=>{await (repository.health?repository.health():repository.read());res.json({status:'ok',database:'mongodb',payment:'not-connected'})});
 app.get('/api/store',async(req,res)=>res.json(publicState(await (repository.publicRead?repository.publicRead():repository.read()))));
 const session=async(req,res,next)=>{req.identity=await authenticate(req);if(!req.identity?.userId)fail('Sign in to continue.',401);next()};
 const admin=(req,res,next)=>{if(!req.identity.isAdmin)fail('Administrator access required.',403);next()};
 app.get('/api/me',session,(req,res)=>res.json({userId:req.identity.userId,isAdmin:req.identity.isAdmin}));
 app.get('/api/orders',session,async(req,res)=>{if(repository.ownedOrders)return res.json(await repository.ownedOrders(req.identity.userId));const d=await repository.read();res.json(d.orders.filter(o=>o.userId===req.identity.userId))});
 app.post('/api/orders',session,rateLimit({windowMs:60000,limit:10,legacyHeaders:false}),async(req,res)=>{const d=await repository.transact(current=>placeOrder(current,req.body,req.identity));res.status(201).json({order:d.orders.find(o=>o.userId===req.identity.userId&&o.requestKey===req.body.requestKey),store:publicState(d)})});
 app.get('/api/admin/state',session,admin,async(req,res)=>res.json(await repository.read()));
 app.patch('/api/admin/state',session,admin,async(req,res)=>res.json(await repository.transact(d=>applyAdminChanges(d,req.body))));
 app.post('/api/bulk-enquiries',rateLimit({windowMs:3600000,limit:10,legacyHeaders:false}),async(req,res)=>{
  const {details,requestKey}=req.body;
  if(typeof requestKey!=='string'||! /^[0-9a-f-]{36}$/i.test(requestKey))fail('Invalid enquiry reference.');
  const record={id:requestKey,details:validateBulk(details||{}),status:'new',note:'',revision:0,createdAt:new Date().toISOString()};
  await repository.createBulk(record);res.status(201).json({id:record.id});
 });
 app.get('/api/admin/bulk-enquiries',session,admin,async(req,res)=>res.json(await repository.listBulk()));
 app.patch('/api/admin/bulk-enquiries/:id',session,admin,async(req,res)=>{
  const {status,note,revision}=req.body;
  if(!bulkStatuses.includes(status)||typeof note!=='string'||note.length>3000||!Number.isInteger(revision)||revision<0)fail('Invalid enquiry update.');
  const result=await repository.updateBulk(req.params.id,revision,{status,note,updatedAt:new Date().toISOString()});
  if(!result)fail('Enquiry changed. Refresh and try again.',409);res.json(result);
 });
 app.use((error,req,res,next)=>{const status=error.status||400;if(status>=500)console.error('API request failed:',error.name);res.status(status).json({error:status>=500?'The service is temporarily unavailable. Please retry.':error.message})});return app;
}

