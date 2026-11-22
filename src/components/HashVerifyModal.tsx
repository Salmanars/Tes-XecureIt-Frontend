'use client';

import { useState, type FormEvent } from 'react';
import { verifyDocumentHash } from '@/lib/api';
import { formatJakartaDateTime } from '@/lib/date-time';
import type { HashVerificationResult } from '@/types/document';

interface HashVerifyModalProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onVerified?: (result: HashVerificationResult) => void;
}

export function HashVerifyModal({ documentId, isOpen, onClose, onVerified }: HashVerifyModalProps) {
  const [result, setResult] = useState<HashVerificationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const verification = await verifyDocumentHash(documentId);
      setResult(verification);
      onVerified?.(verification);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Hash gagal diverifikasi.');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    if (loading) return;
    setError('');
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="verify-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Integritas dokumen</p>
            <h2 id="verify-title" className="mt-1 text-xl font-bold text-ink">Verifikasi SHA-256</h2>
          </div>
          <button type="button" aria-label="Tutup" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Server menghitung SHA-256 dari file privat saat ini dan membandingkannya dengan hash versi yang tersimpan.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {result && (
          <div role="status" className={`mt-4 rounded-xl p-4 ${result.valid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">
              {result.status === 'FILE_MISSING'
                ? 'File privat tidak ditemukan; integritas tidak dapat diverifikasi.'
                : result.valid
                  ? 'Valid — hash cocok dan dokumen terverifikasi.'
                  : 'Mismatch — terdeteksi perubahan atau manipulasi pada dokumen.'}
            </p>
            <p className="mt-1 text-sm">{result.message}</p>
            <p className="mt-3 break-all font-mono text-xs">Hash tersimpan: {result.expectedHash}</p>
            <p className="mt-1 break-all font-mono text-xs">Hash file saat ini: {result.actualHash || 'Tidak tersedia'}</p>
            <p className="mt-2 text-xs">Versi {result.version.number} · {formatJakartaDateTime(result.verifiedAt)}</p>
          </div>
        )}
        <form onSubmit={submit} className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={close} disabled={loading} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Tutup</button>
          <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Memverifikasi…' : 'Periksa integritas'}</button>
        </form>
      </section>
    </div>
  );
}
