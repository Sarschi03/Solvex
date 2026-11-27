import type { Pool } from "pg";
import type { Role } from "./profiles.js";
export const accountTables={customer:'customers',employee:'employees',manager:'managers',administrator:'administrators'} as const;
export const accountColumns={customer:'customer_id',employee:'employee_id',manager:'manager_id',administrator:'administrator_id'} as const;
export async function canSignIn(pool:Pool,role:Role,id:string){
  return !!(await pool.query(`SELECT id FROM account_registry WHERE ${accountColumns[role]}=$1 AND enabled AND active_role=$2`,[id,role])).rowCount;
}
