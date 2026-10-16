import 'dotenv/config';
import {MongoClient} from 'mongodb';
import {MongoRepository} from './repository.js';
import {initialCommerce} from '../src/commerceModel.js';
if(!process.env.MONGODB_URI)throw new Error('Set MONGODB_URI.');const client=new MongoClient(process.env.MONGODB_URI);try{await client.connect();const repo=new MongoRepository(client,client.db(process.env.MONGODB_DB||'flamiva'));await repo.init();await repo.transact(d=>{if(d.products.length||d.orders.length||d.categories.length)throw new Error('Database is not empty. Seed cancelled to preserve existing data.');return {...initialCommerce(),revision:d.revision}});console.log('Sample catalog seeded. Review actual prices, stock and specifications before launch.')}finally{await client.close()}
