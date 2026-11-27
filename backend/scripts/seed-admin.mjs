import 'dotenv/config';
import { Pool } from 'pg';
import argon2 from 'argon2';
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST??''))throw new Error('Administrator demo seed is local-only.');
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client=await pool.connect();
try{
  await client.query('BEGIN');
  const existing=(await client.query("SELECT administrator_id FROM account_usernames WHERE username='admin'")).rows[0];
  if(!existing){
    const hash=await argon2.hash('geslo123');
    const admin=(await client.query("INSERT INTO administrators(first_name,last_name,email,password_hash) VALUES('Demo','Administrator','admin@solvex.local',$1) RETURNING id",[hash])).rows[0];
    await client.query("INSERT INTO account_usernames(username,administrator_id) VALUES('admin',$1)",[admin.id]);
  }
  await client.query('COMMIT');console.log('Local demo administrator ready; existing account preserved.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
