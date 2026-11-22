'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuditTrailTable } from '@/components/AuditTrailTable';
import { CollaborationIndicator } from '@/components/CollaborationIndicator';
import { HashVerifyModal } from '@/components/HashVerifyModal';
import { Navbar } from '@/components/Navbar';
import { ShareDocumentModal } from '@/components/ShareDocumentModal';
import { UploadDocumentModal } from '@/components/UploadDocumentModal';
import {
  documentStatusClass,
  documentStatusLabel,
  roleLabel as getRoleLabel,
  scanStatusClass,
  scanStatusLabel,
} from '@/lib/labels';
import { formatJakartaDateTime } from '@/lib/date-time';
import {
  deleteDocument,
  downloadDocument,
  getCurrentUser,
  getAuditTrail,
  getDocument,
  getSession,
  listDocumentVersions,
  listDocuments,
  publishDocumentActivity,
  updateDocumentStatus,
} from '@/lib/api';
import type { AuditTrailItem, Document, DocumentRole } from '@/types/document';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function roleFor(document: Document, userId: string): DocumentRole {
  if (document.role) return document.role;
  return document.ownerId === userId ? 'owner' : 'viewer';
}

function roleLabel(role: DocumentRole): string {
  return getRoleLabel(role);
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listDocumentVersions>>>([]);
  const [auditItems, setAuditItems] = useState<AuditTrailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState('');
  const [auditLoading, setAuditLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [versionUploadOpen, setVersionUploadOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [accountRole, setAccountRole] = useState<DocumentRole | null>(null);
  const role = document ? roleFor(document, userId) : 'viewer';

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [current, documentList] = await Promise.all([
        getDocument(documentId),
        listDocuments(),
      ]);
      const listEntry = documentList.find((item) => item.id === documentId);
      setDocument({
        ...current,
        role:
          listEntry?.role ||
          (current.ownerId === (getSession()?.user.id || '') ? 'owner' : 'viewer'),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dokumen gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, [documentId, router]);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError('');
    try {
      setVersions(await listDocumentVersions(documentId));
    } catch (loadError) {
      setVersionsError(loadError instanceof Error ? loadError.message : 'Riwayat versi gagal dimuat.');
    } finally {
      setVersionsLoading(false);
    }
  }, [documentId]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      setAuditItems(await getAuditTrail(documentId));
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : 'Riwayat aktivitas gagal dimuat.');
    } finally {
      setAuditLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setUserName(session.user.name);
    setUserEmail(session.user.email);
    setUserId(session.user.id);
    setAccountRole(session.user.role || null);
    let active = true;
    void getCurrentUser().then((currentUser) => {
      if (active && getSession()?.user.id === session.user.id) {
        setAccountRole(currentUser.role || session.user.role || null);
      }
    }).catch((roleLoadError: unknown) => {
      if (active) {
        setActionError(
          roleLoadError instanceof Error
            ? `Role akun tidak dapat disegarkan dari API: ${roleLoadError.message}`
            : 'Role akun tidak dapat disegarkan dari API.',
        );
      }
    });
    setHasSession(true);
    void loadDocument();
    void loadVersions();
    return () => { active = false; };
  }, [loadDocument, loadVersions, router]);

  useEffect(() => {
    if (role === 'viewer') {
      setAuditItems([]);
      setAuditError('');
      setAuditLoading(false);
      return;
    }
    void loadAudit();
  }, [loadAudit, role]);

  useEffect(() => {
    if (!document) {
      setPreviewUrl('');
      setPreviewText('');
      setPreviewLoading(false);
      setPreviewError('');
      return;
    }
    const isPdf = /\.pdf$/i.test(document.fileName);
    const isText = /\.(txt|csv)$/i.test(document.fileName) || document.mimeType.startsWith('text/');
    if (!isPdf && !isText) {
      setPreviewUrl('');
      setPreviewText('');
      setPreviewLoading(false);
      setPreviewError('');
      return;
    }
    if (role === 'viewer' && document.status !== 'VERIFIED') {
      setPreviewUrl('');
      setPreviewText('');
      setPreviewLoading(false);
      setPreviewError('File tersedia setelah disetujui Owner.');
      return;
    }
    if (document.scanStatus === 'INFECTED' || versions[0]?.scanStatus === 'INFECTED') {
      setPreviewUrl('');
      setPreviewText('');
      setPreviewLoading(false);
      setPreviewError('Pratinjau dinonaktifkan karena file terdeteksi berisiko.');
      return;
    }

    let active = true;
    let objectUrl = '';
    setPreviewLoading(true);
    setPreviewText('');
    setPreviewError('');
    void downloadDocument(document.id).then(async ({ blob }) => {
      if (!active) return;
      if (isPdf) {
        const pdfBlob = blob.type === 'application/pdf' ? blob : blob.slice(0, blob.size, 'application/pdf');
        objectUrl = URL.createObjectURL(pdfBlob);
        setPreviewUrl(objectUrl);
      } else {
        const text = await blob.text();
        if (active) setPreviewText(text.slice(0, 30_000));
      }
    }).catch((previewLoadError: unknown) => {
      if (active) setPreviewError(previewLoadError instanceof Error ? previewLoadError.message : 'Pratinjau PDF gagal dimuat.');
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document, role, versions]);

  async function handleDownload() {
    if (document?.scanStatus === 'INFECTED' || versions[0]?.scanStatus === 'INFECTED') {
      setActionError('Unduhan diblokir karena server melaporkan file terinfeksi.');
      return;
    }
    setDownloading(true);
    setActionError('');
    try {
      const { blob, fileName } = await downloadDocument(documentId);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || document?.fileName || 'dokumen';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : 'Dokumen gagal diunduh.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleOwnerDecision(status: 'VERIFIED' | 'REJECTED') {
    const note = reviewNote.trim();
    if (status === 'REJECTED' && !note) {
      setActionError('Tambahkan catatan agar Editor tahu bagian yang perlu diperbaiki.');
      return;
    }

    setReviewLoading(true);
    setActionError('');
    try {
      const updated = await updateDocumentStatus(documentId, {
        status,
        statusNote: status === 'REJECTED' ? note : null,
      });
      setDocument((current) => current ? { ...current, ...updated, role: current.role, owner: current.owner } : updated);
      setReviewNote('');
      await Promise.all([loadDocument(), loadVersions(), loadAudit()]);
    } catch (reviewError) {
      setActionError(reviewError instanceof Error ? reviewError.message : 'Keputusan dokumen gagal disimpan.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Hapus dokumen ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;
    setDeleting(true);
    setActionError('');
    try {
      await deleteDocument(documentId);
      router.replace('/dashboard');
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Dokumen gagal dihapus.');
      setDeleting(false);
    }
  }

  function startVersionUpload() {
    setActionError('');
    setVersionUploadOpen(true);
    void publishDocumentActivity(documentId, 'editing').catch((activityError: unknown) => {
      setActionError(activityError instanceof Error ? activityError.message : 'Status kolaborasi gagal diperbarui.');
    });
  }

  function finishVersionUpload() {
    setVersionUploadOpen(false);
    void publishDocumentActivity(documentId, 'active').catch((activityError: unknown) => {
      setActionError(activityError instanceof Error ? activityError.message : 'Status kolaborasi gagal diperbarui.');
    });
  }

  if (!hasSession) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Memeriksa sesi…</main>;
  }

  const principalRole = accountRole || role;
  const isOwner = principalRole === 'owner' && role === 'owner';
  const canCollaborate = principalRole !== 'viewer' && (role === 'editor' || role === 'owner');
  const canUploadVersion = principalRole === 'owner' && role === 'owner';
  const canShare = canCollaborate;
  const latestHash = versions[0]?.sha256 || document?.sha256;
  const downloadBlocked = document?.scanStatus === 'INFECTED' || versions[0]?.scanStatus === 'INFECTED';

  return (
    <div className={`min-h-screen bg-canvas transition-[padding] duration-200 ${sidebarCollapsed ? 'md:pl-0' : 'md:pl-80'}`}>
      <Navbar
        userName={userName}
        userEmail={userEmail}
        role={principalRole}
        profileRole={accountRole || role}
        pageTitle="Detail dokumen"
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        {role !== 'viewer' && <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"><span aria-hidden="true">←</span> Kembali ke dokumen</Link>}
        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-500">Memuat detail dokumen…</div>
        ) : error || !document ? (
          <section className="mt-8 rounded-2xl border border-rose-100 bg-white p-8 text-center">
            <p role="alert" className="text-sm text-rose-700">{error || 'Dokumen tidak ditemukan.'}</p>
            <button onClick={() => void loadDocument()} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Coba lagi</button>
          </section>
        ) : role === 'viewer' ? (
          <>
            <div className="mt-2 text-xs text-slate-500"><Link href="/dashboard?view=documents" className="hover:text-blue-700">Dokumen untuk Saya</Link> <span aria-hidden="true">/</span> {document.name || document.fileName}</div>
            <header className="mt-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{document.name || document.fileName}</h1>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${documentStatusClass(document.status)}`}>{documentStatusLabel(document.status)}</span>
              </div>
              <p className="mt-2 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                {document.status === 'VERIFIED' ? 'Disetujui Owner' : 'Menunggu persetujuan Owner'} · {formatJakartaDateTime(document.updatedAt)}
              </p>
            </header>

            <div className="mt-5 grid items-stretch gap-4 lg:grid-cols-[1.4fr_0.95fr]">
              <section aria-label="Pratinjau dokumen" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="overflow-hidden rounded-xl bg-slate-200">
                  {document.status !== 'VERIFIED' ? (
                    <div className="grid min-h-[360px] place-items-center px-6 text-center text-sm text-slate-600 sm:min-h-[450px]">File dapat dilihat setelah disetujui Owner.</div>
                  ) : document.fileName.toLocaleLowerCase().endsWith('.pdf') ? previewLoading ? (
                    <div role="status" className="grid min-h-[360px] place-items-center text-sm text-slate-600 sm:min-h-[450px]">Memuat pratinjau PDF…</div>
                  ) : previewUrl ? (
                    <iframe title={`Pratinjau PDF ${document.name || document.fileName}`} src={previewUrl} className="h-[420px] w-full bg-slate-200 sm:h-[450px]" />
                  ) : (
                    <div className="grid min-h-[360px] place-items-center px-6 text-center text-sm text-slate-600 sm:min-h-[450px]">{previewError || 'Pratinjau PDF tidak tersedia.'}</div>
                  ) : /\.(txt|csv)$/i.test(document.fileName) || document.mimeType.startsWith('text/') ? previewLoading ? (
                    <div role="status" className="grid min-h-[360px] place-items-center text-sm text-slate-600 sm:min-h-[450px]">Memuat isi dokumen…</div>
                  ) : previewError ? (
                    <div role="alert" className="grid min-h-[360px] place-items-center px-6 text-center text-sm text-rose-700 sm:min-h-[450px]">{previewError}</div>
                  ) : (
                    <pre className="max-h-[450px] min-h-[360px] overflow-auto whitespace-pre-wrap break-words bg-white p-5 text-left text-sm text-slate-700">{previewText || 'Dokumen teks kosong.'}</pre>
                  ) : (
                    <div className="grid min-h-[360px] place-items-center px-6 text-center text-sm text-slate-600 sm:min-h-[450px]">Pratinjau DOCX belum tersedia. Gunakan tombol Unduh untuk memeriksa dokumen.</div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {document.status === 'VERIFIED' && <button type="button" onClick={() => void handleDownload()} disabled={downloading || downloadBlocked} className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{downloadBlocked ? 'Unduhan diblokir' : downloading ? 'Mengunduh…' : document.fileName.toLocaleLowerCase().endsWith('.pdf') ? 'Unduh PDF' : 'Unduh file'}</button>}
                  <button type="button" onClick={() => setVerifyOpen(true)} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cek file saya</button>
                </div>
                {actionError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
              </section>

              <section aria-labelledby="viewer-proof-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 id="viewer-proof-heading" className="text-lg font-bold text-ink">Bukti keaslian</h2>
                <dl className="mt-3 divide-y divide-slate-200 text-sm">
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Persetujuan Owner</dt><dd className="text-right font-medium text-slate-800">{document.status === 'VERIFIED' ? 'Disetujui' : 'Menunggu'}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">{document.status === 'VERIFIED' ? 'Tanggal persetujuan' : 'Pembaruan terakhir'}</dt><dd className="text-right text-slate-800">{formatJakartaDateTime(document.updatedAt)}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Versi</dt><dd className="font-medium text-slate-800">v{versions[0]?.version || document.currentVersion || 1}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">SHA-256</dt><dd className="font-mono text-xs text-slate-800">{latestHash ? `${latestHash.slice(0, 4)}…${latestHash.slice(-4)}` : 'Belum tersedia'}</dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Tanda tangan HMAC</dt><dd><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Dikelola server</span></dd></div>
                  <div className="flex items-center justify-between gap-3 py-3"><dt className="text-slate-600">Rantai versi</dt><dd><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{versionsLoading ? 'Memuat…' : versions.length ? `${versions.length} versi` : 'Riwayat tersedia'}</span></dd></div>
                </dl>
                <p className="mt-2 text-xs leading-5 text-slate-500">{document.status === 'VERIFIED' ? 'Saat Anda mengunduh, server memeriksa hash file. Gunakan “Cek file saya” untuk menjalankan verifikasi SHA-256.' : 'File belum dapat diunduh sampai disetujui Owner. Anda tetap dapat memeriksa hash yang tercatat.'}</p>
              </section>
            </div>
          </>
        ) : (
          <>
            {isOwner && document.status === 'PENDING_VERIFICATION' && (
              <section aria-labelledby="owner-review-heading" className="mt-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 id="owner-review-heading" className="font-bold text-ink">Keputusan Owner</h2>
                    <p className="mt-1 text-sm text-slate-600">Tinjau versi v{versions[0]?.version || document.currentVersion || 1}. Setelah disetujui, Viewer dapat mengunduhnya.</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Menunggu verifikasi</span>
                </div>
                <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="owner-review-note">Catatan revisi <span className="font-normal text-slate-500">(wajib jika dikembalikan)</span></label>
                <textarea id="owner-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={1000} rows={3} placeholder="Jelaskan bagian yang perlu diperbaiki Editor" className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => void handleOwnerDecision('REJECTED')} disabled={reviewLoading} className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">{reviewLoading ? 'Menyimpan…' : 'Kembalikan untuk revisi'}</button>
                  <button type="button" onClick={() => void handleOwnerDecision('VERIFIED')} disabled={reviewLoading} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{reviewLoading ? 'Menyimpan…' : 'Setujui dokumen'}</button>
                </div>
              </section>
            )}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-700">
                    {document.fileName.split('.').pop()?.toUpperCase() || 'FILE'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-600">Hak akses {roleLabel(role)}</p>
                    <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{document.name || document.fileName}</h1>
                    <p className="mt-2 text-sm text-slate-500">{document.fileName} · {formatSize(document.size)}</p>
                    <p className="mt-1 text-xs text-slate-400">Diunggah {formatJakartaDateTime(document.createdAt)} · Versi {versions[0]?.version || document.currentVersion || 1}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Status dokumen</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${documentStatusClass(document.status)}`}>
                        {documentStatusLabel(document.status)}
                      </span>
                    </div>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                      {document.statusNote || 'Catatan status siklus verifikasi belum disediakan oleh server.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setVerifyOpen(true)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700">Verifikasi SHA-256</button>
                  <button onClick={() => void handleDownload()} disabled={downloading || downloadBlocked} title={downloadBlocked ? scanStatusLabel('INFECTED') : undefined} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {downloadBlocked ? 'Unduhan diblokir' : downloading ? 'Mengunduh…' : 'Unduh aman'}
                  </button>
                  {canUploadVersion && <button onClick={startVersionUpload} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700">Unggah versi</button>}
                  {canShare && <button onClick={() => setShareOpen(true)} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100">{isOwner ? 'Bagikan / kelola akses' : 'Bagikan ke Penerima'}</button>}
                  {isOwner && <button onClick={() => void handleDelete()} disabled={deleting} className="rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{deleting ? 'Menghapus…' : 'Hapus'}</button>}
                </div>
              </div>

              {actionError && <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</p>}

              <div className="mt-7 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pemilik</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{document.owner?.name || document.owner?.email || 'Pemilik dokumen'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">SHA-256</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-600">{latestHash || 'Hash tersedia melalui verifikasi'}</p>
                </div>
              </div>
            </section>

            {(document.fileName.toLocaleLowerCase().endsWith('.pdf') || /\.(txt|csv)$/i.test(document.fileName) || document.mimeType.startsWith('text/')) && (
              <section aria-labelledby="document-preview-heading" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 id="document-preview-heading" className="font-bold text-ink">Pratinjau dokumen</h2>
                  <p className="mt-1 text-xs text-slate-500">Periksa isi versi terbaru sebelum menyetujui atau mengembalikannya.</p>
                </div>
                {previewLoading ? (
                  <p role="status" className="grid min-h-[360px] place-items-center text-sm text-slate-500">Memuat pratinjau…</p>
                ) : previewError ? (
                  <p role="alert" className="grid min-h-[240px] place-items-center px-6 text-center text-sm text-rose-700">{previewError}</p>
                ) : document.fileName.toLocaleLowerCase().endsWith('.pdf') ? (
                  previewUrl ? <iframe title={`Pratinjau ${document.name || document.fileName}`} src={previewUrl} className="h-[70vh] min-h-[420px] w-full bg-slate-100" /> : <p className="grid min-h-[240px] place-items-center text-sm text-slate-500">Pratinjau PDF belum tersedia.</p>
                ) : (
                  <pre className="max-h-[70vh] min-h-[240px] overflow-auto whitespace-pre-wrap break-words p-5 text-sm text-slate-700">{previewText || 'Dokumen teks kosong.'}</pre>
                )}
              </section>
            )}

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-bold text-ink">Riwayat versi</h2>
                  <p className="mt-1 text-xs text-slate-500">Versi dokumen yang tersimpan</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Read-only</span>
              </div>
              {versionsError ? (
                <p role="alert" className="m-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{versionsError}</p>
              ) : versionsLoading ? (
                <p className="px-5 py-6 text-sm text-slate-500">Memuat riwayat versi…</p>
              ) : !versions.length ? (
                <p className="px-5 py-6 text-sm text-slate-500">Belum ada riwayat versi.</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {versions.map((version) => (
                    <li key={version.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700">v{version.version}</span>
                      <div className="min-w-[170px] flex-1">
                        <p className="text-sm font-semibold text-slate-800">{version.fileName || (version.version === versions[0]?.version ? document.fileName : `Versi ${version.version}`)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Diunggah oleh {typeof version.createdBy === 'string' ? version.createdBy : version.createdBy.name}
                          {typeof version.size === 'number' ? ` · ${formatSize(version.size)}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Catatan perubahan: {version.changeNote || 'Belum tersedia dari API'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Status scan:{' '}
                          <span className={`rounded-full px-2 py-0.5 font-medium ${scanStatusClass(version.scanStatus)}`}>
                            {scanStatusLabel(version.scanStatus)}
                          </span>
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">{formatJakartaDateTime(version.createdAt)}</span>
                      <p className="w-full break-all pl-12 font-mono text-[11px] text-slate-400">SHA-256: {version.sha256}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {canCollaborate && (
              <>
                <div className="mt-5">
                  <CollaborationIndicator documentId={documentId} />
                </div>
                <div className="mt-7">
                  <AuditTrailTable items={auditItems} loading={auditLoading} error={auditError} />
                </div>
              </>
            )}
          </>
        )}
      </main>
      {document && canShare && (
        <ShareDocumentModal
          documentId={documentId}
          isOpen={shareOpen}
          allowOwnerRole={isOwner}
          onClose={() => setShareOpen(false)}
          onShared={() => { void loadDocument(); void loadAudit(); }}
        />
      )}
      {document && canUploadVersion && (
        <UploadDocumentModal
          documentId={documentId}
          isOpen={versionUploadOpen}
          onClose={finishVersionUpload}
          onUploaded={() => { void loadDocument(); void loadVersions(); void loadAudit(); }}
        />
      )}
      {document && <HashVerifyModal documentId={documentId} isOpen={verifyOpen} onClose={() => setVerifyOpen(false)} />}
    </div>
  );
}
