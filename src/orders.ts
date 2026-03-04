import crypto from 'node:crypto';

interface OrderInput {
  ph: number;
  hours: number;
  pool: string;
  worker: string;
  user: string;
}

interface Order {
  id: string;
  ph: number;
  hours: number;
  pool: string;
  worker: string;
  user: string;
  status: 'pending' | 'active' | 'complete' | 'canceled';
  totalUsd: number;
}

const orders = new Map<string, Order>();

export async function createOrder(input: OrderInput): Promise<Order> {
  const id = crypto.randomUUID();
  // In real impl, recompute quote and lock price
  const totalUsd = 0;
  const order: Order = { id, totalUsd, status: 'pending', ...input };
  orders.set(id, order);
  return order;
}

export async function getOrderStatus(id: string): Promise<string> {
  const o = orders.get(id);
  if (!o) return 'Not found';
  return `Order ${id}: ${o.status}, ${o.ph} PH for ${o.hours}h to ${o.pool} worker ${o.worker}`;
}

export async function cancelOrder(id: string): Promise<string> {
  const o = orders.get(id);
  if (!o) return 'Not found';
  if (o.status === 'active') return 'Cannot cancel active order';
  o.status = 'canceled';
  return `Order ${id} canceled`;
}
