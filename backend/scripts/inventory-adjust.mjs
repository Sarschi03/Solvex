import 'dotenv/config';
import { Pool } from 'pg';
if (!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST ?? '')) throw new Error('Inventory maintenance is local-only.');
const args=process.argv.slice(2);
const value=key=>{const index=args.indexOf(key);return index<0?undefined:args[index+1];};
const sku=value('--sku'),quantityText=value('--quantity'),thresholdText=value('--threshold');
const valid=value=>value!==undefined&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=2147483647;
if(!sku||args.length%2!==0||!valid(quantityText)||(thresholdText!==undefined&&!valid(thresholdText))||args.some((value,index)=>index%2===0&&!['--sku','--quantity','--threshold'].includes(value))) throw new Error('Usage: npm run inventory:adjust -- --sku SKU --quantity N [--threshold N]');
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client=await pool.connect();
try {
  await client.query('BEGIN');
  const part=(await client.query('SELECT * FROM inventory_parts WHERE sku=$1 FOR UPDATE',[sku])).rows[0];
  if(!part) throw new Error('Catalog part not found.');
  const quantity=Number(quantityText),threshold=thresholdText===undefined?part.low_stock_threshold:Number(thresholdText),delta=quantity-part.quantity_on_hand;
  await client.query('UPDATE inventory_parts SET quantity_on_hand=$2,low_stock_threshold=$3,updated_at=NOW() WHERE id=$1',[part.id,quantity,threshold]);
  if(delta!==0) await client.query("INSERT INTO stock_movements (part_id,quantity_delta,stock_after,reason) VALUES ($1,$2,$3,$4)",[part.id,delta,quantity,delta>0?'restock':'adjustment']);
  if(quantity>threshold) await client.query('UPDATE inventory_alerts SET resolved_at=NOW() WHERE part_id=$1 AND resolved_at IS NULL',[part.id]);
  else await client.query('INSERT INTO inventory_alerts (part_id) VALUES ($1) ON CONFLICT (part_id) WHERE resolved_at IS NULL DO NOTHING',[part.id]);
  await client.query('COMMIT');console.log('Local inventory quantity and threshold updated.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
