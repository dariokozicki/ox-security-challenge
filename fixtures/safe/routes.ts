// Negative controls; analyzed as text, never executed.
import { execFile } from 'node:child_process';
export function lookupOrder(req: any, res: any, db: any) {
  db.query('SELECT * FROM orders WHERE id = ?', [req.query.orderId]);
}
export function exportReceipt(req: any, res: any) {
  execFile('convert-receipt', [req.body.filename]);
  res.json({ queued: true });
}
export function greetCustomer(req: any, res: any) {
  res.json({ name: req.query.name });
}
