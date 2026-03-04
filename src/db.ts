import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
const dbPath = join(dataDir, 'bot.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.prepare(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  ph REAL NOT NULL,
  hours INTEGER NOT NULL,
  pool TEXT NOT NULL,
  worker TEXT NOT NULL,
  user TEXT NOT NULL,
  status TEXT NOT NULL,
  totalUsd REAL NOT NULL,
  createdAt INTEGER NOT NULL
)
`).run();

export { db };
