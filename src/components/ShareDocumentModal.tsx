'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  listDocumentInvitations,
  listDocumentShares,
  removeDocumentShare,
  revokeDocumentInvitation,
  shareDocument,
  updateDocumentShare,
} from '@/lib/api';
import { INVITATION_STATUS_LABELS, roleLabel } from '@/lib/labels';
import { formatJakartaDateTime } from '@/lib/date-time';
import type { DocumentInvitation, DocumentRole, DocumentShare } from '@/types/document';

interface ShareDocumentModalProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  allowOwnerRole?: boolean;
  onShared?: () => void;
}

export function ShareDocumentModal({
  documentId,
  isOpen,
  onClose,
  allowOwnerRole = false,
  onShared,
}: ShareDocumentModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DocumentRole>('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [invitations, setInvitations] = useState<DocumentInvitation[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [revokingId, setRevokingId] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    if (!isOpen || !allowOwnerRole) return;
    let active = true;
    setAccessLoading(true);
    setAccessLoaded(false);
    setAccessError('');

    void Promise.all([
      listDocumentShares(documentId),
      listDocumentInvitations(documentId),
    ])
      .then(([documentShares, documentInvitations]) => {
        if (!active) return;
        setShares(documentShares);
        setInvitations(documentInvitations);
        setAccessLoaded(true);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setAccessLoaded(false);
          setAccessError(loadError instanceof Error ? loadError.message : 'Daftar akses tidak dapat dimuat.');
        }
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [allowOwnerRole, documentId, isOpen]);

  useEffect(() => {
    if (!allowOwnerRole) setRole('viewer');
  }, [allowOwnerRole]);

  if (!isOpen) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const requestedRole = allowOwnerRole ? role : 'viewer';
      const result = await shareDocument(documentId, email.trim(), requestedRole);
      setSuccess(
        result.type === 'INVITATION'
          ? `Undangan email untuk ${email.trim()} berhasil dikirim. Berlaku hingga ${formatJakartaDateTime(result.invitation.expiresAt)}.`
          : `Akses ${roleLabel(result.share.role)} berhasil diberikan kepada ${result.share.email}.`,
      );
      if (result.type === 'INVITATION') {
        setInvitations((current) => [result.invitation, ...current.filter((item) => item.id !== result.invitation.id)]);
      } else {
        setShares((current) => [result.share, ...current.filter((item) => item.id !== result.share.id)]);
      }
      setEmail('');
      onShared?.();
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Undangan gagal dikirim.');
    } finally {
      setLoading(false);
    }
  }

  async function revokeShare(share: DocumentShare) {
    if (!window.confirm(`Cabut akses ${share.email} ke dokumen ini?`)) return;
    setRevokingId(share.id);
    setAccessError('');
    try {
      await removeDocumentShare(documentId, share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
      onShared?.();
    } catch (revokeError) {
      setAccessError(revokeError instanceof Error ? revokeError.message : 'Akses gagal dicabut.');
    } finally {
      setRevokingId('');
    }
  }

  async function changeShareRole(share: DocumentShare, nextRole: DocumentRole) {
    if (nextRole === share.role) return;
    setUpdatingId(share.id);
    setAccessError('');
    try {
      const updatedShare = await updateDocumentShare(documentId, share.id, nextRole);
      setShares((current) => current.map((item) => item.id === share.id ? updatedShare : item));
      onShared?.();
    } catch (updateError) {
      setAccessError(updateError instanceof Error ? updateError.message : 'Peran akses gagal diperbarui.');
    } finally {
      setUpdatingId('');
    }
  }

  async function revokeInvitation(invitation: DocumentInvitation) {
    if (!window.confirm(`Cabut undangan untuk ${invitation.email}?`)) return;
    setRevokingId(invitation.id);
    setAccessError('');
    try {
      await revokeDocumentInvitation(documentId, invitation.id);
      setInvitations((current) => current.map((item) =>
        item.id === invitation.id ? { ...item, status: 'revoked' } : item,
      ));
      onShared?.();
    } catch (revokeError) {
      setAccessError(revokeError instanceof Error ? revokeError.message : 'Undangan gagal dicabut.');
    } finally {
      setRevokingId('');
    }
  }

  function close() {
    if (loading || revokingId || updatingId) return;
    setEmail('');
    setError('');
    setSuccess('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">{allowOwnerRole ? 'Undangan & pengelolaan akses' : 'Penerima dokumen'}</p>
            <h2 id="share-title" className="mt-1 text-xl font-bold text-ink">{allowOwnerRole ? 'Bagikan atau ubah akses' : 'Bagikan ke penerima'}</h2>
          </div>
          <button type="button" aria-label="Tutup" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Email kolaborator
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Hak akses
            <select value={role} onChange={(event) => setRole(event.target.value as DocumentRole)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500">
              <option value="viewer">{roleLabel('viewer')} — melihat, mengunduh, dan memverifikasi</option>
              {allowOwnerRole && <option value="editor">{roleLabel('editor')} — menerbitkan dan mengelola dokumen</option>}
              {allowOwnerRole && <option value="owner">{roleLabel('owner')} — kontrol penuh dokumen</option>}
            </select>
          </label>
          <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800">
            {allowOwnerRole
              ? 'Undang penerima atau tingkatkan pengguna menjadi Penerbit. Role Owner memberikan kontrol penuh pada dokumen ini.'
              : 'Penerima hanya dapat melihat, mengunduh, dan memverifikasi dokumen.'}
          </p>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}
          {allowOwnerRole && (
            <section aria-labelledby="access-list-title" className="border-t border-slate-100 pt-4">
              <h3 id="access-list-title" className="font-semibold text-slate-800">Kelola akses dan undangan</h3>
              {accessLoading ? (
                <p role="status" className="mt-3 text-sm text-slate-500">Memuat akses dokumen…</p>
              ) : accessError && !accessLoaded ? (
                <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{accessError}</p>
              ) : (
                <div className="mt-3 space-y-4">
                  {accessError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{accessError}</p>}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Akses aktif</p>
                    {shares.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Belum ada akses kolaborator.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100">
                        {shares.map((share) => (
                          <li key={share.id} className="flex items-center justify-between gap-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-700">{share.email}</span>
                            </span>
                            <label className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="sr-only">Ubah role {share.email}</span>
                              <select
                                value={share.role}
                                disabled={updatingId === share.id || revokingId === share.id}
                                onChange={(event) => void changeShareRole(share, event.target.value as DocumentRole)}
                                className="max-w-56 rounded-md border border-slate-200 bg-white px-2 py-1.5 disabled:opacity-50"
                              >
                                <option value="viewer">{roleLabel('viewer')}</option>
                                <option value="editor">{roleLabel('editor')}</option>
                                <option value="owner">{roleLabel('owner')}</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={revokingId === share.id || updatingId === share.id}
                              onClick={() => void revokeShare(share)}
                              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              {revokingId === share.id ? 'Mencabut…' : 'Cabut akses'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Undangan</p>
                    {invitations.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">Belum ada undangan.</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-slate-100">
                        {invitations.map((invitation) => (
                          <li key={invitation.id} className="flex items-center justify-between gap-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-700">{invitation.email}</span>
                              <span className="text-xs text-slate-400">
                                {roleLabel(invitation.role)} · {INVITATION_STATUS_LABELS[invitation.status]}
                              </span>
                            </span>
                            {invitation.status === 'pending' && (
                              <button
                                type="button"
                                disabled={revokingId === invitation.id}
                                onClick={() => void revokeInvitation(invitation)}
                                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {revokingId === invitation.id ? 'Mencabut…' : 'Cabut undangan'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={close} disabled={loading || Boolean(revokingId) || Boolean(updatingId)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Tutup</button>
            <button type="submit" disabled={loading || Boolean(revokingId) || Boolean(updatingId)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Memproses…' : 'Bagikan / undang'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
