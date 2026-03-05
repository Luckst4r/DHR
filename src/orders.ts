import crypto from 'node:crypto';
import { db } from './db.js';

export type OrderStatus = 'pending' | 'payment_required' | 'active' | 'complete' | 'canceled';

interface OrderInput {
  ph: number;
  hours: number;
  pool: string;
  worker: string;
  user: string;
  totalUsd: number;
}

export interface Order {
  id: string;
  ph: number;
  hours: number;
  pool: string;
  worker: string;
  user: string;
  status: OrderStatus;
  totalUsd: number;
  createdAt: number;
  nhOrderId?: string;
  nhMarket?: string;
  nhPrice?: number;
  nhLimit?: number;
  nhAmount?: number;
  expiresAt?: number;
}

// Prepared statements for CRUD
const insertStmt = db.prepare(
  'INSERT INTO orders (id, ph, hours, pool, worker, user, status, totalUsd, createdAt, nhOrderId, nhMarket, nhPrice, nhLimit, nhAmount, expiresAt) VALUES (@id,@ph,@hours,@pool,@worker,@user,@status,@totalUsd,@createdAt,@nhOrderId,@nhMarket,@nhPrice,@nhLimit,@nhAmount,@expiresAt)'
);
const getStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
const updateStatusStmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
const updateNhStmt = db.prepare('UPDATE orders SET nhOrderId=?, nhMarket=?, nhPrice=?, nhLimit=?, nhAmount=? WHERE id=?');
const updateExpiresStmt = db.prepare('UPDATE orders SET expiresAt=? WHERE id=?');

// Create a new order in DB with default status payment_required and computed expiry.
export async function createOrder(input: OrderInput): Promise<Order> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + input.hours * 3600 * 1000;
  const order: any = {
    id,
    status: 'payment_required',
    createdAt: now,
    nhOrderId: null,
    nhMarket: null,
    nhPrice: null,
    nhLimit: null,
    nhAmount: null,
    expiresAt,
    ...input,
  };
  insertStmt.run(order);
  return order as Order;
}

// Fetch single order
export async function getOrder(id: string): Promise<Order | undefined> {
  const row = getStmt.get(id) as Order | undefined;
  return row;
}

// Human-readable status string
export async function getOrderStatus(id: string): Promise<string> {
  const o = await getOrder(id);
  if (!o) return 'Not found';
  return `Order ${id}: ${o.status}, ${o.ph} PH for ${o.hours}h to ${o.pool} worker ${o.worker}`;
}

// Cancel if not active
export async function cancelOrder(id: string): Promise<string> {
  const o = await getOrder(id);
  if (!o) return 'Not found';
  if (o.status === 'active') return 'Cannot cancel active order';
  updateStatusStmt.run('canceled', id);
  return `Order ${id} canceled`;
}

// Mark paid -> active
export async function markPaid(id: string): Promise<string> {
  const o = await getOrder(id);
  if (!o) return 'Not found';
  if (o.status !== 'payment_required' && o.status !== 'pending') return `Order ${id} not awaiting payment`;
  updateStatusStmt.run('active', id);
  return `Order ${id} marked paid and active`;
}

// Store NH order metadata
export async function saveNhInfo(id: string, info: { nhOrderId: string; nhMarket: string; nhPrice: number; nhLimit: number; nhAmount: number }) {
  updateNhStmt.run(info.nhOrderId, info.nhMarket, info.nhPrice, info.nhLimit, info.nhAmount, id);
}

// Store expiry timestamp
export async function updateExpiry(id: string, expiresAt: number) {
  updateExpiresStmt.run(expiresAt, id);
}
