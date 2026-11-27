import 'dotenv/config';
import { Pool } from 'pg';
if (!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST ?? '')) throw new Error('Inventory demo seed is local-only.');
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client=await pool.connect();
try {
  await client.query('BEGIN');
  for(const [sku,name,manufacturer,quantity,threshold] of [['FUSE-10A','Varovalka 10 A','Demo elektro',4,3],['MC4-PAIR','Par priključkov MC4','Demo solar',20,5],['PANEL-400','Panel 400 W','Demo solar',6,2]]) {
    const part=await client.query('INSERT INTO inventory_parts (sku,name,manufacturer,quantity_on_hand,low_stock_threshold) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sku) DO NOTHING RETURNING id',[sku,name,manufacturer,quantity,threshold]);
    if(part.rowCount) await client.query("INSERT INTO stock_movements (part_id,quantity_delta,stock_after,reason) VALUES ($1,$2,$2,'initial')",[part.rows[0].id,quantity]);
  }
  await client.query('COMMIT');console.log('Local inventory catalog ready; existing stock was preserved.');
} catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
