import type { AuditTrailItem } from '@/types/document';
import { formatJakartaDateTime } from '@/lib/date-time';

interface AuditTrailTableProps {
  items: AuditTrailItem[];
  loading?: boolean;
  error?: string;
}

function actorName(actor: AuditTrailItem['actor']): string {
  if (!actor) return 'Sistem';
  return typeof actor === 'string' ? actor : actor.name || actor.email;
}

function actionLabel(action: string): string {
  return action.replace(/[_-]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AuditTrailTable({ items, loading = false, error }: AuditTrailTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-bold text-ink">Riwayat aktivitas</h2>
          <p className="mt-1 text-xs text-slate-500">Aktivitas terbaru pada dokumen ini</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">Immutable · read-only</span>
      </div>
      {error ? (
        <p role="alert" className="m-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : loading ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Memuat riwayat aktivitas…</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Belum ada aktivitas yang tercatat.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-3 font-semibold">Aktivitas</th><th className="px-5 py-3 font-semibold">Pengguna</th><th className="px-5 py-3 font-semibold">Detail</th><th className="px-5 py-3 font-semibold">Waktu</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="text-slate-600">
                  <td className="px-5 py-4 font-semibold text-slate-800">{actionLabel(item.action)}</td>
                  <td className="px-5 py-4">{actorName(item.actor)}</td>
                  <td className="max-w-[220px] truncate px-5 py-4">{item.details || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatJakartaDateTime(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
