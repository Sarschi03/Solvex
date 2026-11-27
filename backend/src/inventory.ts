import type { Router } from "express";
import type { Pool, PoolClient } from "pg";
import { requireSession } from "./profiles.js";

export type InventoryReportPart = { inventory_part_id: string | null; name: string; manufacturer: string | null; quantity: number; replaced: boolean; installed_on: string | null };
export class InventoryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function prepareInventoryParts(client: PoolClient, parts: InventoryReportPart[]) {
  const result: InventoryReportPart[] = [];
  for (const part of parts) {
    if (!part.inventory_part_id) { result.push(part); continue; }
    const catalog = (await client.query('SELECT name,manufacturer FROM inventory_parts WHERE id=$1 AND active', [part.inventory_part_id])).rows[0];
    if (!catalog) throw new InventoryError('Izbrani del ni več na voljo v katalogu.', 400);
    result.push({ ...part, name: catalog.name, manufacturer: catalog.manufacturer });
  }
  return result;
}
// Caller holds the report lock; stock and completion use this same transaction.
export async function consumeInventory(client: PoolClient, reportId: string, serviceId: string, parts: InventoryReportPart[]) {
  const totals = new Map<string, number>();
  for (const part of parts) {
    if (!part.inventory_part_id) throw new InventoryError('Pred oddajo pri vsaki postavki izberi del iz kataloga zaloge.', 400);
    totals.set(part.inventory_part_id, (totals.get(part.inventory_part_id) ?? 0) + part.quantity);
  }
  const ids = [...totals.keys()].sort((a,b) => BigInt(a)<BigInt(b)?-1:1);
  const locked = new Map<string, {name:string;active:boolean;quantity_on_hand:number;low_stock_threshold:number}>();
  for (const id of ids) {
    const row = (await client.query('SELECT name,active,quantity_on_hand,low_stock_threshold FROM inventory_parts WHERE id=$1 FOR UPDATE', [id])).rows[0];
    const quantity = totals.get(id)!;
    if (!row || !row.active) throw new InventoryError('Del ni več aktiven v katalogu. Poročilo ostaja osnutek.');
    if (!Number.isSafeInteger(quantity) || quantity > row.quantity_on_hand) throw new InventoryError(`Za del »${row.name}« ni dovolj zaloge (na voljo ${row.quantity_on_hand}, zahtevano ${quantity}). Poročilo ostaja osnutek.`);
    locked.set(id,row);
  }
  for (const id of ids) {
    const row = locked.get(id)!;
    const quantity = totals.get(id)!;
    const stockAfter = row.quantity_on_hand-quantity;
    await client.query('UPDATE inventory_parts SET quantity_on_hand=$2,updated_at=NOW() WHERE id=$1', [id,stockAfter]);
    await client.query("INSERT INTO stock_movements (part_id,report_id,quantity_delta,stock_after,reason) VALUES ($1,$2,$3,$4,'report_consumption')", [id,reportId,-quantity,stockAfter]);
    if (stockAfter <= row.low_stock_threshold) {
      const alert = await client.query(`INSERT INTO inventory_alerts (part_id,report_id) VALUES ($1,$2)
        ON CONFLICT (part_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id`, [id,reportId]);
      if (alert.rowCount) await client.query(`INSERT INTO notifications (manager_id,service_id,kind,message)
        SELECT id,$1,'low_stock',$2 FROM managers`, [serviceId,`Nizka zaloga: ${row.name}. Na voljo ${stockAfter}, meja ${row.low_stock_threshold}. Priporočamo dopolnitev.`]);
    }
  }
}
export function installInventoryRoutes(router: Router, pool: Pool) {
  router.get('/inventory/parts',requireSession(pool,['employee','manager']),async(_request,response)=>{
    try {
      const result=await pool.query('SELECT id,sku,name,manufacturer,quantity_on_hand,low_stock_threshold,quantity_on_hand<=low_stock_threshold AS low_stock FROM inventory_parts WHERE active ORDER BY name,sku');
      return response.json({parts:result.rows});
    } catch { return response.status(500).json({message:'Kataloga delov ni bilo mogoče naložiti.'}); }
  });
  router.get('/managers/inventory',requireSession(pool,['manager']),async(_request,response)=>{
    const client=await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const parts=await client.query('SELECT id,sku,name,manufacturer,quantity_on_hand,low_stock_threshold,active,quantity_on_hand<=low_stock_threshold AS low_stock FROM inventory_parts ORDER BY name,sku');
      const movements=await client.query(`SELECT m.id,m.part_id,m.report_id,m.quantity_delta,m.stock_after,m.reason,m.created_at,p.sku,p.name,sr.id_service AS service_id
        FROM stock_movements m JOIN inventory_parts p ON p.id=m.part_id LEFT JOIN service_reports sr ON sr.id=m.report_id ORDER BY m.created_at DESC,m.id DESC LIMIT 100`);
      const alerts=await client.query(`SELECT a.id,a.part_id,a.created_at,p.sku,p.name,p.quantity_on_hand,p.low_stock_threshold
        FROM inventory_alerts a JOIN inventory_parts p ON p.id=a.part_id WHERE a.resolved_at IS NULL AND p.active AND p.quantity_on_hand<=p.low_stock_threshold ORDER BY a.created_at DESC`);
      await client.query('COMMIT');
      return response.json({parts:parts.rows,movements:movements.rows,alerts:alerts.rows});
    } catch {await client.query('ROLLBACK');return response.status(500).json({message:'Zaloge ni bilo mogoče naložiti.'});}
    finally {client.release();}
  });
}
