import type { Inventory } from '../shared/intelligence-types';
import { Card } from './components/ui/card';

export function InventoryPanel({ inventory }: { inventory?: Inventory }) {
  if (!inventory) return null;
  return (
    <Card className="mt-6 border-slate-200 p-6">
      <h2 className="text-base font-semibold">Components & runtime evidence</h2>
      <details>
        <summary className="cursor-pointer text-sm text-slate-800">
          Inspect {inventory.components.length} identified components
        </summary>
        <div className="mt-4 max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Component</th>
                <th className="p-2">Version / constraint</th>
                <th className="p-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {inventory.components.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="p-2">
                    {c.name}
                    <small className="block text-slate-500">{c.ecosystem || c.kind}</small>
                  </td>
                  <td className="p-2">
                    {c.version}
                    <small className="block text-slate-500">{c.precision}</small>
                  </td>
                  <td className="break-all p-2">
                    {c.evidence.path}:{c.evidence.line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {inventory.warnings
        .filter((w) => !w.startsWith('Runtime declarations describe build intent,'))
        .map((w) => (
          <p key={w} className="text-sm leading-6 text-amber-800">
            {w}
          </p>
        ))}
    </Card>
  );
}
