'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { acceptInvitation, ApiError, getSession } from '@/lib/api';

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const claimStarted = useRef(false);

  useEffect(() => {
    if (claimStarted.current) return;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('Tautan undangan tidak memiliki token yang valid.');
      setLoading(false);
      return;
    }

    if (!getSession()) {
      const returnPath = `/invitations/accept?token=${encodeURIComponent(token)}`;
      router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
      return;
    }

    claimStarted.current = true;
    void acceptInvitation(token)
      .then(({ role }) => {
        setMessage(`Undangan diterima. Anda sekarang memiliki akses ${role}.`);
      })
      .catch((acceptError: unknown) => {
        if (
          acceptError instanceof ApiError &&
          acceptError.code === 'INVITATION_NOT_PENDING'
        ) {
          setMessage('Undangan sudah diproses saat Anda masuk atau sudah tidak aktif.');
          return;
        }
        setError(acceptError instanceof Error ? acceptError.message : 'Undangan gagal diklaim.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${error ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
          {loading ? '…' : error ? '!' : '✓'}
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Klaim undangan dokumen</h1>
        {loading ? (
          <p role="status" className="mt-3 text-sm text-slate-500">Memverifikasi undangan…</p>
        ) : error ? (
          <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>
        ) : (
          <p role="status" className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
        )}
        {!loading && (
          <Link href="/dashboard" className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Buka dashboard
          </Link>
        )}
      </section>
    </main>
  );
}
