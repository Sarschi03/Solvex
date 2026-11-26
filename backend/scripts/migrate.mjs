import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(730107)');
  await client.query(`CREATE TABLE IF NOT EXISTS solvex_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const schemaSql = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
  const result = await client.query('SELECT name FROM solvex_migrations WHERE name = $1', ['001-initial-schema']);
  if (result.rowCount === 0) {
    await client.query(schemaSql);
    await client.query('INSERT INTO solvex_migrations (name) VALUES ($1)', ['001-initial-schema']);
    console.log('Applied 001-initial-schema');
  } else {
    console.log('Database schema is up to date');
  }
  const profiles = await client.query('SELECT name FROM solvex_migrations WHERE name = $1', ['002-user-profiles-and-sessions']);
  if (profiles.rowCount === 0) {
    const marker = '-- migration: 002-user-profiles-and-sessions';
    if (!schemaSql.includes(marker)) throw new Error('Missing profile migration in database/schema.sql');
    await client.query(schemaSql.slice(schemaSql.indexOf(marker) + marker.length));
    await client.query('INSERT INTO solvex_migrations (name) VALUES ($1)', ['002-user-profiles-and-sessions']);
    console.log('Applied 002-user-profiles-and-sessions');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
