// Intentionally vulnerable static-analysis fixture. Never imported or executed.
import { exec } from 'node:child_process';

export function lookupOrder(req: any, res: any, db: any) {
  const orderId = req.query.orderId;
  const sql = "SELECT * FROM orders WHERE id = '" + orderId + "'";
  db.query(sql);
}

export function exportReceipt(req: any, res: any) {
  const file = req.body.filename;
  exec('convert-receipt ' + file);
  res.json({ queued: true });
}

export function greetCustomer(req: any, res: any) {
  const name = req.query.name;
  res.send('<h1>Welcome, ' + name + '</h1>');
}
