'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { HashVerifyModal } from '@/components/HashVerifyModal';
import { Navbar } from '@/components/Navbar';
import { JakartaClock } from '@/components/JakartaClock';
import { ShareDocumentModal } from '@/components/ShareDocumentModal';
import { UploadDocumentModal } from '@/components/UploadDocumentModal';
import { CollaborationIndicator } from '@/components/CollaborationIndicator';
import {
  DOCUMENT_CONTEXT,
  HASH_STATUS_LABELS,
  INVITATION_STATUS_LABELS,
  documentStatusClass,
  documentStatusLabel,
  roleLabel,
  scanStatusLabel,
} from '@/lib/labels';
import { formatJakartaDateTime } from '@/lib/date-time';
import {
  deleteDocument,
  downloadDocument,
  getCurrentUser,
  getSession,
  getAuditTrail,
  listDocumentInvitations,
  listDocumentShares,
  listDocumentVersions,
  listDocuments,
  removeDocumentShare,
  revokeDocumentInvitation,
  shareDocument,
  uploadDocument,
  updateDocument,
  updateDocumentShare,
  verifyDocumentHash,
} from '@/lib/api';
import { MAX_DOCUMENT_UPLOAD_SIZE, validateDocumentUploadFile } from '@/lib/upload-validation';
import type {
  AuditTrailItem,
  Document,
  DocumentInvitation,
  DocumentRole,
  DocumentShare,
  DocumentVersion,
  HashVerificationResult,
} from '@/types/document';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRevisionDateTime(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('day')} ${part('month')} ${part('year')}, ${part('hour')}.${part('minute')}`;
}

function fileKind(mimeType: string, fileName: string): string {
  const extension = fileName.split('.').pop()?.toUpperCase();
  if (extension && ['PDF', 'DOCX', 'TXT', 'CSV'].includes(extension)) return extension;
  if (mimeType.includes('pdf')) return 'PDF';
  return extension || 'FILE';
}

function documentRole(document: Document, userId: string): DocumentRole {
  return document.role || (document.ownerId === userId ? 'owner' : 'viewer');
}

function detectRole(documents: Document[], userId: string): DocumentRole | null {
  if (documents.length === 0) return null;
  if (documents.some((document) => documentRole(document, userId) === 'owner')) return 'owner';
  if (documents.some((document) => documentRole(document, userId) === 'editor')) return 'editor';
  return 'viewer';
}

function roleTitle(role: DocumentRole): string {
  return roleLabel(role);
}

function sharedDocumentTotal(documents: Document[]): string {
  if (documents.length === 0) return '0';
  const documentsWithShareCounts = documents.filter(
    (document) => typeof document.shareCount === 'number',
  );
  if (documentsWithShareCounts.length === 0) return '-';
  return String(documentsWithShareCounts.filter((document) => (document.shareCount || 0) > 0).length);
}

function verificationLabel(result?: HashVerificationResult): string {
  if (!result) return 'Belum diperiksa';
  return HASH_STATUS_LABELS[result.status];
}

function historyCategory(action: string): 'received' | 'downloaded' | 'verified' | 'other' {
  const normalized = action.toLocaleLowerCase();
  if (normalized.includes('download')) return 'downloaded';
  if (normalized.includes('verify')) return 'verified';
  if (normalized.includes('accept') || normalized.includes('receive') || normalized.includes('share')) return 'received';
  return 'other';
}

function historyActionLabel(entry: DashboardAuditEntry): string {
  const category = historyCategory(entry.action);
  if (category === 'downloaded') return `Anda mengunduh ${entry.documentName}`;
  if (category === 'verified') return `Anda memverifikasi hash ${entry.documentName}`;
  if (category === 'received') return `Dokumen ${entry.documentName} diterima`;
  return `${entry.action.replace(/[_-]/g, ' ')} - ${entry.documentName}`;
}

function auditActionPresentation(action: string): { label: string; className: string } {
  const normalized = action.toLocaleLowerCase();
  if (normalized.includes('verify') || normalized.includes('hash')) {
    return { label: 'verifikasi', className: 'bg-emerald-50 text-emerald-700' };
  }
  if (normalized.includes('share') || normalized.includes('invitation')) {
    return { label: normalized.includes('invitation') ? 'undang' : 'bagikan', className: 'bg-violet-50 text-violet-700' };
  }
  if (normalized.includes('role')) {
    return { label: 'ubah role', className: 'bg-amber-50 text-amber-800' };
  }
  if (normalized.includes('download')) {
    return { label: 'unduh', className: 'bg-indigo-50 text-indigo-700' };
  }
  if (normalized.includes('delete')) {
    return { label: 'hapus', className: 'bg-rose-50 text-rose-700' };
  }
  if (normalized.includes('upload') || normalized.includes('version') || normalized.includes('created')) {
    return { label: normalized.includes('version') ? 'unggah versi' : 'unggah', className: 'bg-blue-50 text-blue-700' };
  }
  if (normalized.includes('scan')) {
    return { label: 'pindai', className: 'bg-slate-100 text-slate-700' };
  }
  return { label: action.replace(/[_-]/g, ' ').toLocaleLowerCase(), className: 'bg-slate-100 text-slate-700' };
}

interface DashboardAuditEntry extends AuditTrailItem {
  documentId: string;
  documentName: string;
}

interface DashboardMemberShare extends DocumentShare {
  documentName: string;
}

interface DashboardMemberInvitation extends DocumentInvitation {
  documentName: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardNow, setDashboardNow] = useState(() => new Date());
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [accountRole, setAccountRole] = useState<DocumentRole | null>(null);
  const roleOverrideAccountId = useRef('');
  const [query, setQuery] = useState('');
  const [viewerDocumentSearch, setViewerDocumentSearch] = useState('');
  const [viewerDownloadSearch, setViewerDownloadSearch] = useState('');
  const [viewerVerificationSearch, setViewerVerificationSearch] = useState('');
  const [viewerVerificationDocumentId, setViewerVerificationDocumentId] = useState('');
  const [sharedQuery, setSharedQuery] = useState('');
  const [sharedRoleFilter, setSharedRoleFilter] = useState<'all' | DocumentRole>('all');
  const [verificationQuery, setVerificationQuery] = useState('');
  const [auditQuery, setAuditQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | DocumentRole>('all');
  const [roleOverride, setRoleOverride] = useState<DocumentRole | null>(null);
  const [view, setView] = useState<'all' | 'documents' | 'members' | 'shared' | 'history' | 'revisions' | 'verify' | 'audit'>('all');
  const [documentStatusFilter, setDocumentStatusFilter] = useState<'all' | 'draft' | 'pending' | 'revision' | 'valid' | 'revoked'>('all');
  const [auditDocumentId, setAuditDocumentId] = useState('all');
  const [auditEntries, setAuditEntries] = useState<DashboardAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditFromDate, setAuditFromDate] = useState('');
  const [auditToDate, setAuditToDate] = useState('');
  const [appliedAuditFilters, setAppliedAuditFilters] = useState({ user: '', action: '', from: '', to: '', query: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [memberShares, setMemberShares] = useState<DashboardMemberShare[]>([]);
  const [memberInvitations, setMemberInvitations] = useState<DashboardMemberInvitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [membersRefreshKey, setMembersRefreshKey] = useState(0);
  const [memberActionId, setMemberActionId] = useState('');
  const [inviteDocumentId, setInviteDocumentId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [memberBeingEdited, setMemberBeingEdited] = useState<DashboardMemberShare | null>(null);
  const [memberEditRole, setMemberEditRole] = useState<'editor' | 'viewer'>('viewer');
  const [membersMessage, setMembersMessage] = useState('');
  const [historyEntries, setHistoryEntries] = useState<DashboardAuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'received' | 'downloaded' | 'verified'>('downloaded');
  const [viewerHistorySearch, setViewerHistorySearch] = useState('');
  const [selectedVerificationId, setSelectedVerificationId] = useState('');
  const [selectedVersions, setSelectedVersions] = useState<DocumentVersion[]>([]);
  const [verificationUploadFile, setVerificationUploadFile] = useState<File | null>(null);
  const [uploadedFileHashResult, setUploadedFileHashResult] = useState<{ actualHash: string; expectedHash: string | null; matches: boolean | null } | null>(null);
  const [verifyAllLoading, setVerifyAllLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState('');
  const [editTarget, setEditTarget] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [shareTarget, setShareTarget] = useState<Document | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<Document | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, HashVerificationResult>>({});
  const [downloadingId, setDownloadingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [versionTarget, setVersionTarget] = useState<Document | null>(null);
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [versionPickerSelection, setVersionPickerSelection] = useState('');
  const [versionUploadFile, setVersionUploadFile] = useState<File | null>(null);
  const [versionDropActive, setVersionDropActive] = useState(false);
  const [versionUploadNote, setVersionUploadNote] = useState('');
  const [versionUploadError, setVersionUploadError] = useState('');
  const [versionUploadMessage, setVersionUploadMessage] = useState('');
  const [versionUploadLoading, setVersionUploadLoading] = useState(false);
  const editorUploadInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await listDocuments());
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Dokumen gagal dimuat.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setDashboardNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (roleOverrideAccountId.current !== session.user.id) {
      setRoleOverride(null);
      roleOverrideAccountId.current = session.user.id;
    }
    let active = true;
    void getCurrentUser().then((user) => {
      if (active && getSession()?.user.id === session.user.id) {
        setAccountRole(user.role || session.user.role || null);
      }
    }).catch(() => undefined);
    const requestedView = new URLSearchParams(window.location.search).get('view');
    if (new URLSearchParams(window.location.search).get('upload') === '1') {
      setUploadOpen(true);
    }
    setView(
      requestedView === 'documents' || requestedView === 'members' || requestedView === 'shared' ||
      requestedView === 'history' || requestedView === 'revisions' || requestedView === 'verify' || requestedView === 'audit'
        ? requestedView
        : 'all',
    );
    setHasSession(true);
    void loadDocuments();
    return () => { active = false; };
  }, [loadDocuments, router]);

  const sharedDocuments = documents;
  const detectedRole = useMemo(() => detectRole(documents, userId), [documents, userId]);
  const principalRole = accountRole || detectedRole || 'viewer';
  const activeRole = roleOverride || principalRole;
  const hasActiveRole = roleOverride !== null || accountRole !== null || detectedRole !== null;
  const filteredSharedDocuments = useMemo(() => {
    const normalizedQuery = sharedQuery.trim().toLocaleLowerCase();
    return sharedDocuments.filter((document) => {
      const role = documentRole(document, userId);
      const matchesQuery = [document.name, document.fileName, document.owner?.name, document.owner?.email]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
      const matchesRole = principalRole === 'viewer'
        ? role === 'viewer'
        : sharedRoleFilter === 'all' || role === sharedRoleFilter;
      return matchesQuery && matchesRole;
    });
  }, [principalRole, sharedDocuments, sharedQuery, sharedRoleFilter, userId]);
  const filteredVerificationDocuments = useMemo(() => {
    const normalizedQuery = verificationQuery.trim().toLocaleLowerCase();
    const showAllAccessibleDocuments = accountRole === 'owner' &&
      roleOverride === null;
    return documents.filter((document) => {
      const role = documentRole(document, userId);
      return (principalRole === 'viewer' ? role === 'viewer' : showAllAccessibleDocuments || role === activeRole) &&
        [document.name, document.fileName].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [accountRole, activeRole, documents, principalRole, roleOverride, userId, verificationQuery]);
  const viewerAuthenticityDocuments = filteredVerificationDocuments.filter((document) =>
    [document.name, document.fileName].some((value) => value.toLocaleLowerCase().includes(viewerVerificationSearch.trim().toLocaleLowerCase())),
  );
  const viewerAuthenticityDocument = viewerAuthenticityDocuments.find((document) => document.id === viewerVerificationDocumentId) || viewerAuthenticityDocuments[0];
  const canUploadDocument = principalRole === 'owner' || principalRole === 'editor';
  const documentsByRole = useMemo(
    () => ({
      owner: documents.filter((document) => documentRole(document, userId) === 'owner'),
      editor: documents.filter((document) => documentRole(document, userId) === 'editor'),
      viewer: documents.filter((document) => documentRole(document, userId) === 'viewer'),
    }),
    [documents, userId],
  );
  const auditDocuments = useMemo(
    () => principalRole === 'owner'
      ? documents
      : principalRole === 'editor' ? documentsByRole.editor : [],
    [accountRole, documents, documentsByRole.editor, principalRole, roleOverride],
  );
  const activeRoleDocuments = documentsByRole[activeRole];
  const versionCandidates = activeRole === 'owner' || activeRole === 'editor'
    ? documentsByRole[activeRole]
    : [];
  const selectedVersionDocument = versionCandidates.find(
    (document) => document.id === versionPickerSelection,
  ) || versionCandidates[0];
  function startVersionUpload() {
    if (!canUploadDocument || activeRole === 'viewer') return;
    if (loading) {
      setActionError('Daftar dokumen masih dimuat. Coba lagi sebentar.');
      return;
    }
    if (versionCandidates.length === 0) {
      setUploadOpen(true);
      return;
    }
    setVersionPickerSelection(versionCandidates[0].id);
    setVersionPickerOpen(true);
  }

  function chooseVersionUploadFile(file?: File) {
    setVersionUploadError('');
    setVersionUploadMessage('');
    if (!file) {
      setVersionUploadFile(null);
      return;
    }
    const validationError = validateDocumentUploadFile(file);
    if (validationError) {
      setVersionUploadFile(null);
      setVersionUploadError(validationError);
      return;
    }
    setVersionUploadFile(file);
  }

  async function handleEditorVersionUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVersionDocument) {
      setVersionUploadError('Pilih dokumen yang dapat Anda kelola.');
      return;
    }
    if (!versionUploadFile) {
      setVersionUploadError('Pilih atau tarik file versi baru terlebih dahulu.');
      return;
    }
    const validationError = validateDocumentUploadFile(versionUploadFile);
    if (validationError) {
      setVersionUploadError(validationError);
      return;
    }
    setVersionUploadLoading(true);
    setVersionUploadError('');
    setVersionUploadMessage('');
    try {
      const updatedDocument = await uploadDocument(versionUploadFile, '', selectedVersionDocument.id);
      addDocument(updatedDocument);
      setVersionUploadMessage(`Versi baru berhasil diunggah untuk ${selectedVersionDocument.name || selectedVersionDocument.fileName}.`);
      setVersionUploadFile(null);
      setVersionUploadNote('');
      await loadDocuments();
    } catch (uploadError) {
      setVersionUploadError(uploadError instanceof Error ? uploadError.message : 'Versi dokumen gagal diunggah.');
    } finally {
      setVersionUploadLoading(false);
    }
  }
  const activeRoleFilter = roleFilter === 'all' ? activeRole : roleFilter;
  const editorDocumentView = activeRole === 'editor' && view === 'documents';
  const ownerDocumentView = principalRole === 'owner' && activeRole === 'owner' && view === 'documents';
  const metricsUnavailable = documents.length === 0 && (loading || Boolean(error));
  const roleDocuments = accountRole === 'owner' && roleOverride === null && activeRole === 'owner'
    ? documents
    : documentsByRole[activeRole];
  const hasCompleteStatusData = !loading && !error && roleDocuments.every((document) => document.status !== undefined);
  const pendingVerificationCount = roleDocuments.filter(
    (document) => document.status === 'PENDING_VERIFICATION',
  ).length;
  const verifiedDocumentCount = roleDocuments.filter(
    (document) => document.status === 'VERIFIED',
  ).length;
  const hashCheckCount = roleDocuments.filter(
    (document) => Boolean(verificationResults[document.id]),
  ).length;
  const hashMatchCount = roleDocuments.filter(
    (document) => verificationResults[document.id]?.valid,
  ).length;
  const revisionCount = roleDocuments.every((document) => typeof document.currentVersion === 'number')
    ? roleDocuments.reduce((total, document) => total + Math.max((document.currentVersion || 0) - 1, 0), 0)
    : null;
  const totalVersionCount = roleDocuments.every((document) => typeof document.currentVersion === 'number')
    ? roleDocuments.reduce((total, document) => total + (document.currentVersion || 0), 0)
    : null;
  const uniqueMemberCount = new Set([
    ...memberShares.map((share) => share.userId || share.email.toLocaleLowerCase()),
    ...(documentsByRole.owner.length > 0 ? [userId] : []),
  ]).size;
  const latestDownload = historyEntries.find((entry) => entry.action.toLocaleLowerCase().includes('download'));
  const latestVerifiedViewerDocument = documentsByRole.viewer
    .filter((document) => document.status === 'VERIFIED')
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt))[0];
  const latestVerifiedViewerAt = latestVerifiedViewerDocument
    ? formatJakartaDateTime(latestVerifiedViewerDocument.updatedAt)
    : null;
  const returnedDocumentCount = roleDocuments.filter((document) => document.status === 'REJECTED').length;
  const ownerPendingDocuments = roleDocuments
    .filter((document) => document.status === 'PENDING_VERIFICATION')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const editorReturnedDocuments = documents
    .filter((document) => {
      const isEditorDocument = documentRole(document, userId) === 'editor' ||
        (principalRole === 'editor' && document.ownerId !== userId);
      const hasReturnSignal = document.status === 'REJECTED' ||
        (Boolean(document.statusNote?.trim()) && document.status !== 'VERIFIED' && document.status !== 'REVOKED');
      return isEditorDocument && hasReturnSignal;
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const editorDraftDocuments = documentsByRole.editor
    .filter((document) => !document.status)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const editorActionDocuments = [
    ...editorReturnedDocuments.map((document) => ({ document, kind: 'revision' as const })),
    ...editorDraftDocuments.map((document) => ({ document, kind: 'draft' as const })),
  ].slice(0, 3);
  const editorDocumentMetrics = [
    { label: 'Draft', value: documentsByRole.editor.filter((document) => !document.status).length },
    { label: 'Menunggu Owner', value: documentsByRole.editor.filter((document) => document.status === 'PENDING_VERIFICATION').length },
    { label: 'Revisi', value: editorReturnedDocuments.length },
    { label: 'Terverifikasi', value: documentsByRole.editor.filter((document) => document.status === 'VERIFIED').length },
  ];
  const ownerMetricCards = [
    { label: 'Menunggu verifikasi', value: loading ? '-' : String(pendingVerificationCount), caption: 'Perlu tindakan', tone: 'bg-amber-100 text-amber-800' },
    { label: 'Terverifikasi', value: loading ? '-' : String(verifiedDocumentCount), caption: 'Hash valid', tone: 'bg-emerald-100 text-emerald-800' },
    { label: 'Dikembalikan ke Editor', value: loading ? '-' : String(returnedDocumentCount), caption: 'Revisi', tone: 'bg-rose-100 text-rose-800' },
    { label: 'Anggota', value: membersLoaded && !membersError ? String(uniqueMemberCount) : '-', caption: membersLoaded && !membersError ? `${memberInvitations.filter((invitation) => invitation.status === 'pending').length} undangan tertunda` : 'Memuat akses', tone: 'bg-blue-100 text-blue-800' },
  ];
  const metrics = activeRole === 'owner'
    ? [
          { label: 'Total Dokumen', value: metricsUnavailable ? '-' : String(roleDocuments.length), caption: 'Dokumen dalam cakupan akses akun', icon: '', color: 'bg-blue-50 text-blue-700' },
          { label: 'Total Anggota', value: membersLoaded && !membersError ? String(uniqueMemberCount) : '-', caption: membersLoaded && !membersError ? `${memberInvitations.filter((invitation) => invitation.status === 'pending').length} undangan tertunda` : 'Data akses dokumen belum dimuat', icon: '', color: 'bg-violet-50 text-violet-700' },
          { label: 'Total Versi', value: totalVersionCount === null ? '-' : String(totalVersionCount), caption: 'Jumlah versi dari data dokumen API', icon: '', color: 'bg-amber-50 text-amber-700' },
          { label: 'Hash Terverifikasi', value: hasCompleteStatusData ? String(verifiedDocumentCount) : '-', caption: hasCompleteStatusData ? 'Dokumen berstatus valid dari server' : 'Status hash belum tersedia dari API', icon: '✓', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Log Audit (immutable)', value: auditLoading ? '-' : String(auditEntries.length), caption: auditError ? 'Audit gagal dimuat' : 'Aktivitas terbaru yang berhasil dimuat', icon: '', color: 'bg-indigo-50 text-indigo-700' },
      ]
    : activeRole === 'editor'
      ? [
            { label: 'Draft', value: metricsUnavailable ? '-' : String(editorDocumentMetrics[0].value), caption: 'Belum diajukan', icon: '', color: 'bg-blue-100 text-blue-800' },
            { label: 'Menunggu Owner', value: metricsUnavailable ? '-' : String(editorDocumentMetrics[1].value), caption: 'Sedang diperiksa', icon: '', color: 'bg-amber-100 text-amber-800' },
            { label: 'Revisi', value: metricsUnavailable ? '-' : String(editorDocumentMetrics[2].value), caption: 'Perlu diperbaiki', icon: '', color: 'bg-rose-100 text-rose-800' },
            { label: 'Terverifikasi', value: metricsUnavailable ? '-' : String(editorDocumentMetrics[3].value), caption: 'Siap dilihat Viewer', icon: '', color: 'bg-emerald-100 text-emerald-800' },
        ]
      : [
            { label: 'Dokumen untuk saya', value: metricsUnavailable ? '-' : String(documentsByRole.viewer.length), caption: 'Dibagikan kepada Anda', icon: '', color: 'bg-blue-50 text-blue-700' },
            { label: 'Terverifikasi', value: hasCompleteStatusData ? String(verifiedDocumentCount) : '-', caption: hasCompleteStatusData ? 'Hash valid' : 'Status belum tersedia dari API', icon: '✓', color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Terbaru diverifikasi', value: latestVerifiedViewerAt || (loading ? '-' : 'Belum ada'), caption: latestVerifiedViewerDocument?.name || latestVerifiedViewerDocument?.fileName || 'Dokumen berstatus valid', icon: '', color: 'bg-violet-50 text-violet-700' },
        ];
  const roleEmptyState = activeRole === 'owner'
    ? {
        title: documents.length === 0 ? DOCUMENT_CONTEXT.emptyTitle : 'Belum ada dokumen milik Anda',
        description: documents.length === 0
          ? DOCUMENT_CONTEXT.emptyDescription
          : 'Dokumen yang Anda miliki akan muncul di sini saat tersedia.',
      }
    : activeRole === 'editor'
      ? {
          title: 'Belum ada dokumen',
          description: 'Dokumen yang Anda susun atau kelola akan muncul di sini.',
        }
      : {
          title: 'Belum ada dokumen untuk ditinjau',
          description: `Dokumen dengan izin ${roleLabel('viewer')} akan muncul di sini.`,
        };
  const noDocumentsForRole = activeRoleDocuments.length === 0;
  const emptyStateTitle = documents.length === 0 || noDocumentsForRole
    ? roleEmptyState.title
    : 'Tidak ada dokumen yang cocok';
  const emptyStateDescription = documents.length === 0 || noDocumentsForRole
    ? roleEmptyState.description
    : ownerDocumentView
      ? 'Ubah kata kunci atau pilih status lain untuk melihat dokumen.'
    : activeRole === 'editor' && view === 'documents'
      ? 'Coba kata kunci lain atau pilih status Semua untuk melihat dokumen lainnya.'
      : 'Ubah kata kunci pencarian untuk melihat dokumen lain.';

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const source = view === 'shared' ? sharedDocuments : documents;
    const showAllAccessibleDocuments = accountRole === 'owner' &&
      roleOverride === null &&
      view !== 'shared';
    return source.filter((document) => {
      const role = documentRole(document, userId);
      const matchesQuery = [document.name, document.fileName, document.owner?.name, document.owner?.email]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
      const statusFilterApplies = ownerDocumentView || editorDocumentView;
      const statusMatches = !statusFilterApplies ||
        documentStatusFilter === 'all' ||
        (documentStatusFilter === 'draft' && !document.status) ||
        (documentStatusFilter === 'pending' && document.status === 'PENDING_VERIFICATION') ||
        (documentStatusFilter === 'revision' && document.status === 'REJECTED') ||
        (documentStatusFilter === 'valid' && document.status === 'VERIFIED') ||
        (documentStatusFilter === 'revoked' && document.status === 'REVOKED');
      return matchesQuery && statusMatches && (showAllAccessibleDocuments || role === activeRoleFilter);
    });
  }, [activeRole, activeRoleFilter, accountRole, documentStatusFilter, documents, editorDocumentView, ownerDocumentView, query, roleOverride, sharedDocuments, userId, view]);
  const viewerDashboardDocuments = documentsByRole.viewer
    .filter((document) => [document.name, document.fileName, document.owner?.name].some((value) => value?.toLocaleLowerCase().includes(viewerDocumentSearch.trim().toLocaleLowerCase())))
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
  const viewerVerifiedDocuments = documentsByRole.viewer
    .filter((document) => document.status === 'VERIFIED')
    .filter((document) => [document.name, document.fileName, document.owner?.name].some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((first, second) => Date.parse(first.updatedAt) - Date.parse(second.updatedAt));
  const viewerDownloadHistory = historyEntries
    .filter((entry) => entry.action.toLocaleLowerCase().includes('download'))
    .filter((entry) => [entry.documentName, entry.details].some((value) => value?.toLocaleLowerCase().includes(viewerDownloadSearch.trim().toLocaleLowerCase())))
    .slice(0, 3);

  useEffect(() => {
    const shouldLoadOwnerMembers = principalRole === 'owner' &&
      activeRole === 'owner' &&
      (view === 'all' || view === 'members' || view === 'shared');
    if (!shouldLoadOwnerMembers) {
      setMembersLoading(false);
      setMembersLoaded(false);
      return;
    }

    let active = true;
    setMembersLoading(true);
    setMembersLoaded(false);
    setMembersError('');
    const ownedDocuments = documentsByRole.owner;
    if (ownedDocuments.length === 0) {
      setMemberShares([]);
      setMemberInvitations([]);
      setMembersLoading(false);
      setMembersLoaded(true);
      return () => { active = false; };
    }

    void Promise.all(ownedDocuments.map(async (document) => {
      const [shares, invitations] = await Promise.all([
        listDocumentShares(document.id),
        listDocumentInvitations(document.id),
      ]);
      return {
        shares: shares.map((share) => ({ ...share, documentName: document.name || document.fileName })),
        invitations: invitations.map((invitation) => ({ ...invitation, documentName: document.name || document.fileName })),
      };
    })).then((rows) => {
      if (!active) return;
      setMemberShares(rows.flatMap((row) => row.shares));
      setMemberInvitations(rows.flatMap((row) => row.invitations));
      setMembersLoaded(true);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setMembersError(loadError instanceof Error ? loadError.message : 'Anggota dan undangan gagal dimuat.');
    }).finally(() => {
      if (active) setMembersLoading(false);
    });

    return () => { active = false; };
  }, [activeRole, documentsByRole.owner, membersRefreshKey, principalRole, view]);

  useEffect(() => {
    const shouldLoadPersonalHistory = view === 'history' ||
      (view === 'all' && activeRole === 'viewer');
    if (!shouldLoadPersonalHistory) {
      setHistoryLoading(false);
      return;
    }

    let active = true;
    const viewerDocuments = documents.filter((document) => documentRole(document, userId) === 'viewer');
    if (viewerDocuments.length === 0) {
      setHistoryEntries([]);
      setHistoryLoading(false);
      setHistoryError('');
      return () => { active = false; };
    }

    setHistoryLoading(true);
    setHistoryError('');
    void Promise.all(viewerDocuments.map(async (document) => {
      const entries = await getAuditTrail(document.id, 1, 100);
      return entries
        .filter((entry) => typeof entry.actor === 'object' && entry.actor?.id === userId)
        .map((entry) => ({
          ...entry,
          documentId: document.id,
          documentName: document.name || document.fileName,
        }));
    })).then((entriesByDocument) => {
      if (!active) return;
      setHistoryEntries(entriesByDocument.flat().sort(
        (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp),
      ));
    }).catch((loadError: unknown) => {
      if (!active) return;
      setHistoryError(loadError instanceof Error ? loadError.message : 'Riwayat pribadi gagal dimuat.');
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });

    return () => { active = false; };
  }, [activeRole, documents, userId, view]);

  const selectedVerificationDocument = view === 'revisions' && activeRole === 'editor'
    ? editorReturnedDocuments.find((document) => document.id === selectedVerificationId) || editorReturnedDocuments[0]
    : filteredVerificationDocuments.find((document) => document.id === selectedVerificationId) || filteredVerificationDocuments[0];

  useEffect(() => {
    if (selectedVerificationDocument && selectedVerificationId !== selectedVerificationDocument.id) {
      setSelectedVerificationId(selectedVerificationDocument.id);
    } else if (!selectedVerificationDocument && selectedVerificationId) {
      setSelectedVerificationId('');
      setSelectedVersions([]);
    }
  }, [selectedVerificationDocument, selectedVerificationId]);

  useEffect(() => {
    const shouldLoadVersions = view === 'verify' || view === 'revisions' ||
      (view === 'all' && activeRole === 'viewer');
    if (!shouldLoadVersions || !selectedVerificationDocument) {
      setSelectedVersions([]);
      setVersionsLoading(false);
      return;
    }

    let active = true;
    setVersionsLoading(true);
    setVersionsError('');
    void listDocumentVersions(selectedVerificationDocument.id).then((versions) => {
      if (active) setSelectedVersions([...versions].sort((first, second) => second.version - first.version));
    }).catch((loadError: unknown) => {
      if (active) {
        setVersionsError(loadError instanceof Error ? loadError.message : 'Riwayat versi gagal dimuat.');
      }
    }).finally(() => {
      if (active) setVersionsLoading(false);
    });

    return () => { active = false; };
  }, [activeRole, selectedVerificationDocument, view]);

  useEffect(() => {
    if (view === 'audit' && !auditDocumentId) setAuditDocumentId('all');
  }, [auditDocumentId, view]);

  useEffect(() => {
    if (view === 'audit' && activeRole === 'editor') setView('all');
  }, [activeRole, view]);

  useEffect(() => {
    const shouldLoadAudit = (view === 'audit' && principalRole === 'owner' && activeRole === 'owner') ||
      (view === 'all' && activeRole === 'owner');
    if (!shouldLoadAudit || auditDocuments.length === 0) {
      setAuditEntries([]);
      setAuditError('');
      setAuditLoading(false);
      return;
    }

    let cancelled = false;
    setAuditLoading(true);
    setAuditError('');
    const targetDocuments = principalRole === 'owner' || auditDocumentId === 'all'
      ? auditDocuments
      : auditDocuments.filter((document) => document.id === auditDocumentId);
    if (targetDocuments.length === 0) {
      setAuditEntries([]);
      setAuditLoading(false);
      return () => { cancelled = true; };
    }

    void Promise.all(targetDocuments.map(async (document) => {
      const entries = await getAuditTrail(document.id, 1, 100);
      return entries.map((entry) => ({
        ...entry,
        documentId: document.id,
        documentName: document.name || document.fileName,
      }));
    })).then((entriesByDocument) => {
      if (!cancelled) {
        setAuditEntries(entriesByDocument.flat().sort(
          (first, second) => Date.parse(second.timestamp) - Date.parse(first.timestamp),
        ));
      }
    }).catch((loadError: unknown) => {
      if (cancelled) return;
      setAuditError(loadError instanceof Error ? loadError.message : 'Audit trail gagal dimuat.');
    }).finally(() => {
      if (!cancelled) setAuditLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeRole, auditDocumentId, auditDocuments, auditRefreshKey, principalRole, view]);

  const filteredAuditEntries = useMemo(() => {
    return auditEntries.filter((entry) => {
      const actor = typeof entry.actor === 'string'
        ? entry.actor
        : entry.actor?.name || entry.actor?.email || '';
      const actorEmail = typeof entry.actor === 'string' ? entry.actor : entry.actor?.email || '';
      const action = entry.action.replace(/[_-]/g, ' ');
      const actionLabel = auditActionPresentation(entry.action).label;
      const date = entry.timestamp.slice(0, 10);
      return [actor, action, entry.details, entry.documentName]
        .some((value) => value?.toLocaleLowerCase().includes(appliedAuditFilters.query.trim().toLocaleLowerCase())) &&
        (!appliedAuditFilters.user || `${actor} ${actorEmail}`.toLocaleLowerCase().includes(appliedAuditFilters.user.toLocaleLowerCase())) &&
        (!appliedAuditFilters.action || `${action} ${actionLabel}`.toLocaleLowerCase().includes(appliedAuditFilters.action.toLocaleLowerCase())) &&
        (!appliedAuditFilters.from || date >= appliedAuditFilters.from) &&
        (!appliedAuditFilters.to || date <= appliedAuditFilters.to);
    });
  }, [auditEntries, appliedAuditFilters]);
  const auditPageSize = 20;
  const auditPageCount = Math.max(1, Math.ceil(filteredAuditEntries.length / auditPageSize));
  const paginatedAuditEntries = filteredAuditEntries.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);

  const filteredHistoryEntries = useMemo(() => historyEntries.filter((entry) => {
    return historyFilter === 'all' || historyCategory(entry.action) === historyFilter;
  }), [historyEntries, historyFilter]);
  useEffect(() => {
    if (inviteDocumentId && documentsByRole.owner.some((document) => document.id === inviteDocumentId)) return;
    setInviteDocumentId(documentsByRole.owner[0]?.id || '');
  }, [documentsByRole.owner, inviteDocumentId]);

  function addDocument(document: Document) {
    setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
  }

  async function handleDownload(document: Document) {
    if (document.scanStatus === 'INFECTED') {
      setActionError('Unduhan diblokir karena server melaporkan file terinfeksi.');
      return;
    }
    setDownloadingId(document.id);
    setActionError('');
    try {
      const { blob, fileName } = await downloadDocument(document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || document.fileName || 'dokumen';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : 'Dokumen gagal diunduh.');
    } finally {
      setDownloadingId('');
    }
  }

  async function handleDelete(document: Document) {
    if (!window.confirm(`Hapus "${document.name || document.fileName}" secara permanen? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingId(document.id);
    setActionError('');
    try {
      await deleteDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setVerificationResults((current) => {
        const { [document.id]: _removed, ...remaining } = current;
        return remaining;
      });
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Dokumen gagal dihapus.');
    } finally {
      setDeletingId('');
    }
  }

  async function handleUpdateDocument() {
    if (!editTarget || !editTitle.trim()) {
      setActionError('Nama dokumen wajib diisi.');
      return;
    }
    setEditLoading(true);
    setActionError('');
    try {
      const updated = await updateDocument(editTarget.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      addDocument(updated);
      setEditTarget(null);
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : 'Dokumen gagal diperbarui.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRemoveMemberShare(share: DashboardMemberShare) {
    if (!window.confirm(`Hapus akses ${share.email} pada "${share.documentName}"?`)) return;
    const actionId = `share:${share.id}`;
    setMemberActionId(actionId);
    setMembersError('');
    try {
      await removeDocumentShare(share.documentId, share.id);
      setMemberShares((current) => current.filter((item) => item.id !== share.id));
      setMembersMessage(`Akses ${share.email} telah dicabut.`);
    } catch (removeError) {
      setMembersError(removeError instanceof Error ? removeError.message : 'Akses anggota gagal dihapus.');
    } finally {
      setMemberActionId('');
    }
  }

  async function handleInviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteDocumentId || !inviteEmail.trim()) {
      setMembersError('Pilih dokumen dan masukkan email penerima.');
      return;
    }
    setMemberActionId('invite');
    setMembersError('');
    setMembersMessage('');
    try {
      const document = documentsByRole.owner.find((item) => item.id === inviteDocumentId);
      if (!document) throw new Error('Dokumen yang dipilih tidak lagi tersedia.');
      const result = await shareDocument(inviteDocumentId, inviteEmail.trim(), inviteRole);
      if (result.type === 'INVITATION') {
        setMemberInvitations((current) => [
          { ...result.invitation, documentName: document.name || document.fileName },
          ...current.filter((invitation) => invitation.id !== result.invitation.id),
        ]);
        setMembersMessage(`Undangan untuk ${inviteEmail.trim()} berhasil dibuat.`);
      } else {
        setMemberShares((current) => [
          { ...result.share, documentName: document.name || document.fileName },
          ...current.filter((share) => share.id !== result.share.id),
        ]);
        setMembersMessage(`${inviteEmail.trim()} sudah memiliki akses ke dokumen ini.`);
      }
      setInviteEmail('');
    } catch (inviteError) {
      setMembersError(inviteError instanceof Error ? inviteError.message : 'Undangan gagal dikirim.');
    } finally {
      setMemberActionId('');
    }
  }

  async function handleSaveMemberRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberBeingEdited) return;
    setMemberActionId(`share:${memberBeingEdited.id}`);
    setMembersError('');
    setMembersMessage('');
    try {
      const updatedShare = await updateDocumentShare(memberBeingEdited.documentId, memberBeingEdited.id, memberEditRole);
      setMemberShares((current) => current.map((share) =>
        share.id === updatedShare.id
          ? { ...updatedShare, documentName: memberBeingEdited.documentName }
          : share,
      ));
      setMembersMessage(`Role akses ${memberBeingEdited.email} berhasil diperbarui.`);
      setMemberBeingEdited(null);
    } catch (updateError) {
      setMembersError(updateError instanceof Error ? updateError.message : 'Role anggota gagal diperbarui.');
    } finally {
      setMemberActionId('');
    }
  }

  async function handleRevokeMemberInvitation(invitation: DashboardMemberInvitation) {
    if (!window.confirm(`Batalkan undangan untuk ${invitation.email}?`)) return;
    const actionId = `invitation:${invitation.id}`;
    setMemberActionId(actionId);
    setMembersError('');
    try {
      await revokeDocumentInvitation(invitation.documentId, invitation.id);
      setMemberInvitations((current) => current.map((item) =>
        item.id === invitation.id ? { ...item, status: 'revoked' } : item,
      ));
      setMembersMessage(`Undangan untuk ${invitation.email} telah dibatalkan.`);
    } catch (revokeError) {
      setMembersError(revokeError instanceof Error ? revokeError.message : 'Undangan gagal dibatalkan.');
    } finally {
      setMemberActionId('');
    }
  }

  async function handleResendMemberInvitation(invitation: DashboardMemberInvitation) {
    const actionId = `invitation:${invitation.id}`;
    setMemberActionId(actionId);
    setMembersError('');
    setMembersMessage('');
    try {
      const result = await shareDocument(invitation.documentId, invitation.email, invitation.role);
      if (result.type === 'INVITATION') {
        setMemberInvitations((current) => [
          { ...result.invitation, documentName: invitation.documentName },
          ...current.filter((item) => item.id !== invitation.id && item.id !== result.invitation.id),
        ]);
        setMembersMessage(`Undangan untuk ${invitation.email} dikirim ulang melalui API.`);
      } else {
        setMemberInvitations((current) => current.filter((item) => item.id !== invitation.id));
        setMembersMessage(`${invitation.email} sudah memiliki akses ke dokumen ini.`);
      }
    } catch (resendError) {
      setMembersError(resendError instanceof Error ? resendError.message : 'Undangan gagal dikirim ulang.');
    } finally {
      setMemberActionId('');
    }
  }

  function renderHistoryPanel(compact = false) {
    const filters = [
      ['all', 'Semua', historyEntries.length],
      ['received', 'Diterima', historyEntries.filter((entry) => historyCategory(entry.action) === 'received').length],
      ['downloaded', 'Diunduh', historyEntries.filter((entry) => historyCategory(entry.action) === 'downloaded').length],
      ['verified', 'Diverifikasi', historyEntries.filter((entry) => historyCategory(entry.action) === 'verified').length],
    ] as const;
    const selectedFilterLabel = filters.find(([filter]) => filter === historyFilter)?.[1] || 'Semua';
    const visibleHistoryEntries = filteredHistoryEntries.filter((entry) =>
      [entry.documentName, entry.details, historyActionLabel(entry)].some((value) => value?.toLocaleLowerCase().includes(viewerHistorySearch.trim().toLocaleLowerCase())),
    );
    const downloadHistoryEntries = visibleHistoryEntries.filter((entry) => historyCategory(entry.action) === 'downloaded');
    const groupedVisibleHistoryEntries = visibleHistoryEntries.reduce<Map<string, DashboardAuditEntry[]>>((groups, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      groups.set(date, [...(groups.get(date) || []), entry]);
      return groups;
    }, new Map());
    return (
      <section aria-labelledby={compact ? 'viewer-history-heading' : 'history-heading'}>
        <div className={`flex flex-wrap items-end justify-between gap-3 ${compact ? 'border-b border-slate-100 px-5 py-5 sm:px-6' : 'mb-6'}`}>
          <div>
            {compact
              ? <h2 id="viewer-history-heading" className="mt-1 text-xl font-bold tracking-tight text-ink">Riwayat Unduhan</h2>
              : <h1 id="history-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[30px]">Riwayat Unduhan</h1>}
            {!compact && <><p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p><p className="mt-2 text-sm text-slate-500 sm:text-base">Daftar dokumen yang pernah Anda unduh beserta waktu dan status hash.</p></>}
          </div>
          {compact && <Link href="/dashboard?view=history" className="text-xs font-semibold text-blue-700 hover:underline">Lihat semua</Link>}
        </div>
        <div className={compact ? 'overflow-hidden rounded-xl border border-slate-200 bg-white' : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'}>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <label className="block sm:w-56">
            <span className="sr-only">Pilih jenis riwayat</span>
            <select aria-label="Filter riwayat Viewer" value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value as typeof historyFilter)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              {filters.map(([filter, label, count]) => <option key={filter} value={filter}>{label} ({count})</option>)}
            </select>
          </label>
        <label className="relative block sm:max-w-md sm:flex-1">
            <span className="sr-only">Cari riwayat</span>
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">-</span>
            <input type="search" value={viewerHistorySearch} onChange={(event) => setViewerHistorySearch(event.target.value)} placeholder={`Cari di ${selectedFilterLabel.toLocaleLowerCase()}-`} className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>
        {historyLoading ? (
          <p role="status" className="px-5 py-8 text-sm text-slate-500">Memuat riwayat aktivitas-</p>
        ) : historyError ? (
          <div className="px-5 py-8">
            <p role="alert" className="text-sm text-rose-700">{historyError}</p>
            <p className="mt-2 text-xs text-slate-500">Riwayat hanya dapat ditampilkan bila API audit dokumen mengizinkan akun ini.</p>
          </div>
        ) : visibleHistoryEntries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            {historyEntries.length === 0 ? 'Belum ada aktivitas pribadi yang tercatat.' : filteredHistoryEntries.length === 0 ? `Belum ada aktivitas ${selectedFilterLabel.toLocaleLowerCase()}.` : 'Tidak ada hasil yang cocok dengan pencarian.'}
          </p>
        ) : historyFilter === 'downloaded' ? (
          <>
            <div className="overflow-x-auto px-5 py-4 sm:px-6">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-600"><tr><th className="rounded-l-xl px-3 py-3">Dokumen</th><th className="px-3 py-3">Diunduh</th><th className="px-3 py-3">Status hash</th><th className="rounded-r-xl px-3 py-3 text-right">Aksi</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {downloadHistoryEntries.slice(0, compact ? 4 : undefined).map((entry) => {
                    const document = documentsByRole.viewer.find((item) => item.id === entry.documentId);
                    const result = document ? verificationResults[document.id] : undefined;
                    return <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="max-w-[330px] truncate px-3 py-4 font-medium text-slate-800">{entry.documentName}{document ? ` - v${document.currentVersion || 1}` : ''}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-700"><time dateTime={entry.timestamp}>{formatJakartaDateTime(entry.timestamp)}</time></td>
                      <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result?.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{result?.valid ? 'Hash cocok' : 'Belum dicek'}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">{document && <Link href={`/documents/${encodeURIComponent(document.id)}`} className="inline-flex rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat</Link>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...groupedVisibleHistoryEntries.entries()].map(([date, entries]) => (
              <section key={date} aria-label={`Aktivitas ${date}`} className="px-5 py-4 sm:px-6">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{date}</h3>
                <ul className="mt-2 divide-y divide-slate-100">
                  {entries.slice(0, compact ? 4 : undefined).map((entry) => {
                    const category = historyCategory(entry.action);
                    return (
                      <li key={entry.id} className="flex items-start gap-3 py-3">
                        <span aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold ${category === 'verified' ? 'bg-emerald-50 text-emerald-700' : category === 'downloaded' ? 'bg-blue-50 text-blue-700' : category === 'received' ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                          {category === 'verified' ? '✓' : category === 'downloaded' ? '↓' : category === 'received' ? '-' : '-'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800">{historyActionLabel(entry)}</span>
                          {entry.details && <span className="mt-1 block text-xs text-slate-500">{entry.details}</span>}
                        </span>
                        <time dateTime={entry.timestamp} className="whitespace-nowrap pt-1 text-xs text-slate-500">
                          {formatJakartaDateTime(entry.timestamp)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!compact && <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500 sm:px-6">Hanya aktivitas akun Anda yang ditampilkan. Log audit global hanya tersedia untuk Owner. Aktivitas bersumber dari audit API dokumen yang dapat Anda akses.</p>}
        </div>
      </section>
    );
  }

  if (!hasSession) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Memeriksa sesi-</main>;
  }

  return (
    <div className={`min-h-screen bg-canvas transition-[padding] duration-200 ${sidebarCollapsed ? 'md:pl-0' : 'md:pl-72'}`}>
      <Navbar
        userName={userName}
        userEmail={userEmail}
        role={activeRole}
        profileRole={accountRole || detectedRole}
        view={view}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-5 lg:px-7 lg:py-8">
        {(view === 'all' || view === 'documents') && (
          <>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className={`${activeRole === 'editor' ? 'mt-0 text-[30px] leading-tight' : 'mt-1'} font-bold tracking-tight text-ink ${activeRole === 'viewer' ? 'text-2xl leading-tight sm:text-[30px]' : activeRole === 'editor' ? '' : 'text-2xl'}`}>
              {view === 'documents'
                ? activeRole === 'owner'
                  ? 'Semua Dokumen'
                  : activeRole === 'editor'
                    ? 'Dokumen'
                    : 'Dokumen untuk Saya'
                : hasActiveRole
                ? activeRole === 'owner'
                  ? 'Selamat Datang, Owner'
                  : activeRole === 'editor'
                    ? `Selamat Datang, ${userName || 'Editor'}`
                    : `Selamat Datang, ${userName || 'Viewer'}`
                : 'Selamat Datang di XecureIT'}
            </h1>
            {((view === 'all' && (activeRole === 'owner' || activeRole === 'viewer' || activeRole === 'editor')) || (view === 'documents' && (activeRole === 'owner' || activeRole === 'viewer' || activeRole === 'editor'))) && <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>}
            <p className={`mt-2 text-slate-500 ${activeRole === 'viewer' ? 'text-sm sm:text-base' : 'text-sm'}`}>
              {!hasActiveRole
                ? 'Peran belum dapat dikenali dari akses dokumen. Pilih tampilan peran untuk pratinjau; hak akses tetap ditentukan oleh API.'
                : activeRole === 'owner'
                ? 'Periksa dokumen dari Editor, lalu verifikasi atau kembalikan dengan catatan.'
                : activeRole === 'editor'
                  ? view === 'documents'
                    ? 'Susun dokumen untuk anggota, ajukan ke Owner, lalu bagikan ke Viewer.'
                    : 'Pantau dokumen yang Anda susun dan yang perlu dikerjakan hari ini.'
                  : view === 'documents'
                    ? 'Hanya dokumen yang sudah diverifikasi Owner yang tampil di sini.'
                    : 'Ringkasan dokumen yang dibagikan kepada Anda.'}
            </p>
          </div>
          {view === 'all' && activeRole === 'editor' && <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">+ Dokumen Baru</button>}
          {view === 'documents' && activeRole === 'editor' && <button type="button" onClick={() => setUploadOpen(true)} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">+ Dokumen Baru</button>}
        </div>


        {view === 'all' && activeRole === 'owner' && <section aria-label="Ringkasan verifikasi" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ownerMetricCards.map((metric) => <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="h-9 w-9 rounded-xl bg-slate-100" /><p className="text-xs font-medium text-slate-600">{metric.label}</p></div><p className="mt-2 text-3xl font-bold text-ink">{metric.value}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${metric.tone}`}>{metric.caption}</span></article>)}
        </section>}
        {view === 'all' && activeRole === 'owner' && <section aria-labelledby="verification-queue-heading" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 id="verification-queue-heading" className="font-bold text-ink">Antrian Verifikasi</h2><span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-800">{ownerPendingDocuments.length} menunggu</span></div><p className="mt-1 text-xs text-slate-500">Dokumen terbaru dari Editor yang menunggu keputusan Anda.</p></div><Link href="/dashboard?view=documents" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat Semua</Link></div>
          {loading ? <p role="status" className="py-7 text-sm text-slate-500">Memuat antrean-</p> : error ? <p role="alert" className="py-7 text-sm text-rose-700">{error}</p> : ownerPendingDocuments.length === 0 ? <p className="py-7 text-sm text-slate-500">Tidak ada dokumen yang menunggu verifikasi.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">Dokumen</th><th className="px-3 py-3">Editor</th><th className="px-3 py-3">Versi</th><th className="px-3 py-3">SHA-256</th><th className="px-3 py-3">Diajukan</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{ownerPendingDocuments.slice(0, 5).map((document) => { const editor = memberShares.find((share) => share.documentId === document.id && share.role === 'editor'); return <tr key={document.id}><td className="max-w-[240px] truncate px-3 py-3.5 font-medium">{document.name || document.fileName}</td><td className="px-3 py-3.5">{editor?.user?.name || editor?.email || '-'}</td><td className="px-3 py-3.5">v{document.currentVersion || 1}</td><td className="px-3 py-3.5 font-mono text-[10px]">{document.sha256 ? `${document.sha256.slice(0, 4)}-${document.sha256.slice(-4)}` : '-'}</td><td className="px-3 py-3.5">{formatJakartaDateTime(document.updatedAt)}</td><td className="px-3 py-2"><Link href={`/documents/${encodeURIComponent(document.id)}`} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white">Tinjau</Link></td></tr>; })}</tbody></table></div>}
        </section>}
        {view === 'all' && activeRole !== 'owner' && <section aria-label="Ringkasan dokumen" className={`mt-5 grid gap-3 ${activeRole === 'editor' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3 sm:gap-5'}`}>
          {metrics.map((metric) => (
            <article key={metric.label} className={`border border-slate-200 bg-white ${activeRole === 'viewer' ? 'min-h-[190px] rounded-2xl p-5 shadow-sm sm:p-6' : activeRole === 'editor' ? 'min-h-[132px] rounded-2xl p-4 shadow-sm' : 'rounded-xl p-4'}`}>
              <span className={`grid place-items-center font-bold ${activeRole === 'viewer' ? 'h-11 w-11 rounded-xl text-lg' : activeRole === 'editor' ? 'h-9 w-9 rounded-xl bg-slate-100' : 'h-9 w-9 rounded-lg text-base'} ${activeRole === 'editor' ? '' : metric.color}`}>{activeRole === 'editor' ? '' : metric.icon}</span>
              <p className={`font-medium text-slate-500 ${activeRole === 'viewer' ? 'mt-4 text-sm' : 'mt-3 text-xs'}`}>{metric.label}</p>
              <p className={`font-bold tracking-tight text-ink ${activeRole === 'viewer' ? metric.label === 'Terbaru diverifikasi' ? 'mt-2 text-lg sm:text-xl' : 'mt-1 text-3xl' : 'mt-1 text-3xl'}`}>{metricsUnavailable ? '-' : metric.value}</p>
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 ${activeRole === 'viewer' ? `${metric.color} text-[11px] font-semibold` : activeRole === 'editor' ? `${metric.color} text-[10px] font-semibold` : 'text-xs text-slate-500'}`}>{metric.caption}</span>
            </article>
          ))}
        </section>}
        {view === 'documents' && activeRole === 'viewer' && (
          <section id="documents" aria-label="Dokumen untuk saya" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="relative mb-4 max-w-md">
              <label className="sr-only" htmlFor="viewer-document-search">Cari dokumen</label>
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">-</span>
              <input id="viewer-document-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari dokumen-" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            {loading ? <p role="status" className="py-10 text-center text-sm text-slate-500">Memuat dokumen-</p> : error ? <p role="alert" className="py-10 text-center text-sm text-rose-700">{error}</p> : viewerVerifiedDocuments.length === 0 ? (
              <div className="py-12 text-center"><h2 className="font-semibold text-slate-800">{documentsByRole.viewer.length === 0 ? 'Belum ada dokumen yang dibagikan' : documentsByRole.viewer.some((document) => document.status === 'VERIFIED') ? 'Dokumen tidak ditemukan' : 'Belum ada dokumen terverifikasi'}</h2><p className="mt-1 text-sm text-slate-500">{documentsByRole.viewer.some((document) => document.status === 'VERIFIED') ? 'Coba kata kunci lain.' : 'Dokumen akan tampil setelah diverifikasi Owner.'}</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-600"><tr><th className="rounded-l-xl px-3 py-3">Dokumen</th><th className="px-3 py-3">Disusun oleh</th><th className="px-3 py-3">Diverifikasi</th><th className="px-3 py-3">Status</th><th className="rounded-r-xl px-3 py-3 text-right">Aksi</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewerVerifiedDocuments.map((document) => <tr key={document.id} className="hover:bg-slate-50/70">
                      <td className="max-w-[290px] truncate px-3 py-4 font-medium text-slate-800">{document.name || document.fileName}</td>
                      <td className="px-3 py-4 text-slate-700">{document.owner?.name || document.owner?.email || 'Editor'}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-700">{formatJakartaDateTime(document.updatedAt)}</td>
                      <td className="px-3 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Terverifikasi</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right"><Link href={`/documents/${encodeURIComponent(document.id)}`} className="inline-flex rounded-lg border border-slate-300 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat</Link><button type="button" onClick={() => void handleDownload(document)} disabled={downloadingId === document.id || document.scanStatus === 'INFECTED'} className="ml-1.5 inline-flex rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{downloadingId === document.id ? 'Mengunduh-' : 'Unduh'}</button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {view === 'documents' && activeRole === 'editor' && <section aria-label="Ringkasan dokumen Editor" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {editorDocumentMetrics.map((metric) => <article key={metric.label} className="min-h-[108px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="h-9 w-9 rounded-xl bg-slate-100" /><p className="text-xs font-medium text-slate-600">{metric.label}</p></div><p className="mt-2 text-3xl font-bold text-ink">{loading || error ? '-' : metric.value}</p></article>)}
        </section>}
        {view === 'documents' && activeRole === 'editor' && editorReturnedDocuments.length > 0 && <section aria-label="Dokumen dikembalikan Owner" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
          <h2 className="font-semibold text-amber-900">{editorReturnedDocuments.length} dokumen dikembalikan Owner</h2>
          {editorReturnedDocuments.slice(0, 2).map((document) => <p key={document.id} className="mt-1 text-sm leading-5 text-amber-800"><span className="font-medium">{document.name || document.fileName} v{document.currentVersion || 1}</span>, dikembalikan {formatJakartaDateTime(document.updatedAt)}. {document.statusNote || 'Periksa catatan Owner, perbaiki dokumen, lalu unggah versi revisi.'}</p>)}
        </section>}
        {view === 'documents' && activeRole !== 'viewer' && <section id="documents" className={`${activeRole === 'editor' ? 'mt-5' : 'mt-7'} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30`}>
          <div className={`flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 ${editorDocumentView ? 'hidden' : ''}`}>
            <div>
              <h2 className="font-bold text-ink">{activeRole === 'owner' ? 'Semua Dokumen' : activeRole === 'editor' ? 'Dokumen' : 'Dokumen yang Dibagikan kepada Anda'}</h2>
              <p className="mt-1 text-xs text-slate-500">{ownerDocumentView ? 'Pantau status verifikasi dan kelola dokumen di ruang kerja.' : `Daftar dokumen dan izin akses - Tampilan ${roleTitle(activeRole)}`}</p>
            </div>
            <button onClick={() => void loadDocuments()} disabled={loading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {loading ? 'Memuat-' : 'Muat ulang'}
            </button>
          </div>
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:px-6">
            <label className={`relative flex-1 ${editorDocumentView ? 'sm:order-2 sm:max-w-[560px]' : ''}`}>
              {editorDocumentView
                ? <span className="mb-1 block text-xs font-medium text-slate-500">Cari dokumen</span>
                : <span className="sr-only">Cari dokumen</span>}
              <span aria-hidden="true" className={`pointer-events-none absolute left-3 ${editorDocumentView ? 'top-[2.35rem]' : 'top-1/2'} -translate-y-1/2 text-slate-400`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={editorDocumentView ? 'Cari nama atau file dokumen-' : DOCUMENT_CONTEXT.searchPlaceholder}
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {editorDocumentView && query && <button type="button" onClick={() => setQuery('')} aria-label="Hapus pencarian dokumen" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">-</button>}
            </label>
            {editorDocumentView || ownerDocumentView ? (
              <label className="block sm:order-1 sm:w-64">
                <span className="mb-1 block text-xs font-medium text-slate-500">Filter status dokumen</span>
                <select value={documentStatusFilter} onChange={(event) => setDocumentStatusFilter(event.target.value as typeof documentStatusFilter)} aria-label="Filter status dokumen" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="all">Semua status ({activeRoleDocuments.length})</option>
                  <option value="draft">Draft ({activeRoleDocuments.filter((document) => !document.status).length})</option>
                  <option value="pending">Menunggu verifikasi ({activeRoleDocuments.filter((document) => document.status === 'PENDING_VERIFICATION').length})</option>
                  <option value="revision">Perlu revisi ({activeRoleDocuments.filter((document) => document.status === 'REJECTED').length})</option>
                  <option value="valid">Terverifikasi ({activeRoleDocuments.filter((document) => document.status === 'VERIFIED').length})</option>
                  <option value="revoked">Dicabut ({activeRoleDocuments.filter((document) => document.status === 'REVOKED').length})</option>
                </select>
              </label>
            ) : (
              <label>
                <span className="sr-only">Filter izin akses</span>
                <select
                  value={roleFilter}
                  onChange={(event) => {
                    const selectedRole = event.target.value as 'all' | DocumentRole;
                    setRoleFilter(selectedRole);
                    setRoleOverride(selectedRole === 'all' ? null : selectedRole);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm capitalize outline-none focus:border-blue-500 sm:w-48"
                >
                  <option value="all">Peran aktif ({roleTitle(activeRole)})</option>
                  <option value="owner">{roleLabel('owner')}</option>
                  <option value="editor">{roleLabel('editor')}</option>
                  <option value="viewer">{roleLabel('viewer')}</option>
                </select>
              </label>
            )}
          </div>
          {(editorDocumentView || ownerDocumentView) && <p aria-live="polite" className="border-b border-slate-100 px-5 pb-3 text-xs text-slate-500 sm:px-6">
            {loading || error ? 'Jumlah dokumen belum tersedia' : <>Menampilkan <span className="font-semibold text-slate-700">{filteredDocuments.length}</span> dari <span className="font-semibold text-slate-700">{activeRoleDocuments.length}</span> dokumen</>}
          </p>}
          {error && (
            <div role="alert" className="mx-5 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">
              <span>{error}</span>
              <button onClick={() => void loadDocuments()} className="font-semibold underline">Coba lagi</button>
            </div>
          )}
          {actionError && <p role="alert" className="mx-5 mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">{actionError}</p>}
          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-slate-500">Memuat dokumen-</div>
          ) : error && documents.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-lg font-bold text-rose-600">!</span>
              <h3 className="mt-4 font-bold text-ink">Dokumen belum dapat dimuat</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Periksa koneksi ke server, lalu coba muat ulang daftar dokumen.</p>
              <button onClick={() => void loadDocuments()} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Coba lagi</button>
            </div>
          ) : !error && filteredDocuments.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>
              </span>
              <h3 className="mt-4 font-bold text-ink">
                {editorDocumentView && documentsByRole.editor.length > 0 ? 'Tidak ada dokumen yang cocok' : emptyStateTitle}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
                {editorDocumentView && documentsByRole.editor.length > 0
                  ? 'Coba ubah kata kunci pencarian atau pilih status lain.'
                  : emptyStateDescription}
              </p>
              {editorDocumentView && documentsByRole.editor.length === 0 && canUploadDocument && (
                <button onClick={() => setUploadOpen(true)} className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                  + Buat dokumen pertama
                </button>
              )}
              {!editorDocumentView && documents.length === 0 && canUploadDocument && (
                <button onClick={() => setUploadOpen(true)} className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                  + {activeRole === 'owner' ? 'Unggah dokumen' : 'Unggah dokumen instansi'}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full ${editorDocumentView ? 'min-w-[790px]' : 'min-w-[980px]'} text-left`}>
                <thead className={editorDocumentView ? 'bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600' : 'bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400'}>
                  {editorDocumentView ? (
                    <tr>
                      <th scope="col" className="px-4 py-3">Dokumen</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Waktu</th>
                      <th scope="col" className="px-4 py-3">Versi</th>
                      <th scope="col" className="px-4 py-3">Viewer</th>
                      <th scope="col" className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  ) : (
                    <tr>
                      <th scope="col" className="px-6 py-3">Dokumen</th>
                      <th scope="col" className="px-4 py-3">Format / ukuran</th>
                      <th scope="col" className="px-4 py-3">{ownerDocumentView ? 'Status dokumen' : 'Peran / status dokumen'}</th>
                      <th scope="col" className="px-4 py-3">Integritas hash</th>
                      <th scope="col" className="px-4 py-3">Diperbarui</th>
                      <th scope="col" className="w-[330px] px-5 py-3 text-right">Aksi</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(editorDocumentView ? [...filteredDocuments].sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt)) : filteredDocuments).map((document) => {
                    const role = documentRole(document, userId);
                    const kind = fileKind(document.mimeType, document.fileName);
                    const verification = verificationResults[document.id];
                    const isOwnerDocument = role === 'owner';
                    const canShareDocument = principalRole !== 'viewer' && (role === 'owner' || role === 'editor');
                    const canUploadVersion = principalRole === 'owner' && activeRole === 'owner' && role === 'owner';
                    if (editorDocumentView) {
                      const statusLabel = !document.status
                        ? 'Draft'
                        : document.status === 'PENDING_VERIFICATION'
                          ? 'Menunggu Owner'
                          : document.status === 'REJECTED'
                            ? 'Revisi'
                            : document.status === 'VERIFIED'
                              ? 'Terverifikasi'
                              : documentStatusLabel(document.status);
                      const statusClass = !document.status
                        ? 'bg-blue-100 text-blue-800'
                        : document.status === 'PENDING_VERIFICATION'
                          ? 'bg-amber-100 text-amber-800'
                          : document.status === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : document.status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : documentStatusClass(document.status);
                      const viewerCount = typeof document.shareCount === 'number'
                        ? document.shareCount
                        : document.shares?.filter((share) => share.role === 'viewer').length;
                      return (
                        <tr key={document.id} className="transition hover:bg-slate-50/70">
                          <td className="max-w-[260px] truncate px-4 py-4">
                            <Link href={`/documents/${encodeURIComponent(document.id)}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-blue-700">{document.name || document.fileName}</Link>
                          </td>
                          <td className="px-4 py-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span></td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">{formatJakartaDateTime(document.updatedAt)}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">v{document.currentVersion || 1}</td>
                          <td className="px-4 py-4 text-sm text-slate-700">{viewerCount ?? '-'}</td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {document.status === 'REJECTED' && <button type="button" onClick={() => setVersionTarget(document)} className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">Unggah versi baru</button>}
                              {document.status === 'VERIFIED' && <button type="button" onClick={() => setShareTarget(document)} className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Kelola Viewer</button>}
                              {(document.status === 'PENDING_VERIFICATION' || document.status === 'REVOKED') && <Link href={`/documents/${encodeURIComponent(document.id)}`} className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat</Link>}
                              {!document.status && <button type="button" disabled title="Pengajuan verifikasi belum tersedia melalui API." className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white opacity-50">Ajukan verifikasi</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={document.id} className="transition hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <div className="flex min-w-56 items-center gap-3">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[9px] font-bold ${kind === 'PDF' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>{kind}</span>
                            <div className="min-w-0">
                              <Link href={`/documents/${encodeURIComponent(document.id)}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-blue-700">
                                {document.name || document.fileName}
                              </Link>
                              <p className="mt-1 max-w-64 truncate text-xs text-slate-400">{document.fileName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-slate-700">{formatSize(document.size)}</p>
                          <p className="mt-1 text-xs text-slate-400">{kind}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {!ownerDocumentView && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{roleLabel(role)}</span>}
                            <span
                              title={document.statusNote || 'Status siklus verifikasi belum disediakan oleh server.'}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${documentStatusClass(document.status)}`}
                            >
                              {document.status === 'VERIFIED' ? 'Terverifikasi' : document.status === 'PENDING_VERIFICATION' ? 'Menunggu verifikasi' : documentStatusLabel(document.status)}
                            </span>
                          </div>
                          {document.owner?.name && <p className="mt-1.5 text-[11px] text-slate-400">oleh {document.owner.name}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            verification?.valid ? 'text-emerald-700' : verification ? 'text-rose-700' : 'text-slate-400'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${verification?.valid ? 'bg-emerald-500' : verification ? 'bg-rose-500' : 'bg-slate-300'}`} />
                            {verificationLabel(verification)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">{formatJakartaDateTime(document.updatedAt)}</td>
                        <td className="w-[330px] px-5 py-4 text-right">
                          <div className="flex w-full flex-wrap items-center justify-end gap-2">
                            <button onClick={() => setVerifyTarget(document)} className="inline-flex min-w-[68px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Cek hash</button>
                            {canShareDocument && (
                              <button onClick={() => setShareTarget(document)} className="inline-flex min-w-[60px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">{activeRole === 'owner' ? 'Akses' : 'Bagikan ke penerima'}</button>
                            )}
                            {canUploadVersion && <button onClick={() => setVersionTarget(document)} className="inline-flex min-w-[80px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Unggah versi baru</button>}
                            {principalRole === 'owner' && activeRole === 'owner' && isOwnerDocument && (
                              <>
                                <button onClick={() => {
                                  setEditTarget(document);
                                  setEditTitle(document.name || document.fileName);
                                  setEditDescription(document.description || '');
                                  setActionError('');
                                }} className="inline-flex min-w-[68px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Edit info</button>
                              </>
                            )}
                            <button onClick={() => void handleDownload(document)} disabled={downloadingId === document.id || document.scanStatus === 'INFECTED'} title={document.scanStatus === 'INFECTED' ? scanStatusLabel(document.scanStatus) : undefined} className="inline-flex min-w-[58px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                              {document.scanStatus === 'INFECTED' ? 'Diblokir' : downloadingId === document.id ? 'Mengunduh-' : 'Unduh'}
                            </button>
                            <Link href={`/documents/${encodeURIComponent(document.id)}`} aria-label={`${document.status === 'PENDING_VERIFICATION' ? 'Tinjau' : document.status === 'REJECTED' ? 'Lihat catatan revisi' : 'Detail'} ${document.name || document.fileName}`} className="inline-flex min-w-[58px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">{document.status === 'PENDING_VERIFICATION' ? 'Tinjau' : document.status === 'REJECTED' ? 'Catatan' : 'Detail'}</Link>
                            {principalRole === 'owner' && activeRole === 'owner' && isOwnerDocument && (
                              <button onClick={() => void handleDelete(document)} disabled={deletingId === document.id} className="inline-flex min-w-[58px] items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                                {deletingId === document.id ? 'Menghapus-' : 'Hapus'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {editorDocumentView && <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500 sm:px-6">Hanya dokumen yang diizinkan Owner yang tampil. Editor tidak memiliki aksi hapus, arsip, atau pengaturan akses.</p>}
        </section>}
          </>
        )}

        {view === 'all' && activeRole === 'editor' && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
            <section aria-labelledby="editor-action-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 id="editor-action-heading" className="font-bold text-ink">Perlu Tindakan</h2>
                  <p className="mt-1 text-xs text-slate-500">Dokumen yang perlu Anda perbaiki atau ajukan ke Owner.</p>
                </div>
                <Link href="/dashboard?view=documents" className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Semua dokumen</Link>
              </div>
              {loading ? (
                <p role="status" className="px-5 py-8 text-sm text-slate-500">Memuat dokumen-</p>
              ) : error ? (
                <p role="alert" className="px-5 py-8 text-sm text-rose-700">{error}</p>
              ) : editorActionDocuments.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">Tidak ada dokumen yang perlu ditindaklanjuti.</p>
              ) : (
                <ul className="divide-y divide-slate-100 px-5">
                  {editorActionDocuments.map(({ document, kind }) => (
                    <li key={document.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/documents/${encodeURIComponent(document.id)}`} className="truncate text-xs font-semibold text-slate-800 hover:text-blue-700">{document.name || document.fileName}</Link>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kind === 'revision' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}`}>{kind === 'revision' ? 'Revisi' : 'Draft'}</span>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-slate-500">
                          {kind === 'revision' ? `Dikembalikan ${formatJakartaDateTime(document.updatedAt)}` : `Disimpan ${formatJakartaDateTime(document.updatedAt)} - belum diajukan`}
                          {document.statusNote ? ` - “${document.statusNote}-` : ''}
                        </p>
                      </div>
                      {kind === 'revision' ? (
                        <button type="button" onClick={() => setVersionTarget(document)} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2.5 text-center text-[11px] font-semibold leading-tight text-white hover:bg-blue-700">Unggah versi<br />baru</button>
                      ) : (
                        <button type="button" disabled title="API belum menyediakan aksi pengajuan verifikasi." className="shrink-0 cursor-not-allowed rounded-lg bg-blue-600 px-3 py-2.5 text-[11px] font-semibold text-white opacity-50">Ajukan verifikasi</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="editor-activity-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 id="editor-activity-heading" className="font-bold text-ink">Aktivitas Terbaru</h2>
                  <p className="mt-1 text-xs text-slate-500">Aktivitas pada dokumen yang Anda kelola.</p>
                </div>
                <Link href="/dashboard?view=audit" className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Lihat semua</Link>
              </div>
              {auditLoading ? (
                <p role="status" className="px-5 py-8 text-sm text-slate-500">Memuat aktivitas-</p>
              ) : auditError ? (
                <p role="alert" className="px-5 py-8 text-sm text-rose-700">{auditError}</p>
              ) : auditEntries.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">Belum ada aktivitas terbaru.</p>
              ) : (
                <ul className="divide-y divide-slate-100 px-5">
                  {auditEntries.slice(0, 5).map((entry) => {
                    const action = entry.action.toLocaleLowerCase();
                    const documentName = entry.documentName || 'dokumen';
                    const activityLabel = action.includes('reject') || action.includes('return')
                      ? `Owner mengembalikan ${documentName}`
                      : action.includes('verify') || action.includes('verification')
                        ? `Owner memverifikasi ${documentName}`
                        : action.includes('submit') || action.includes('pending')
                          ? `${documentName} diajukan ke Owner`
                          : action.includes('upload') || action.includes('version')
                            ? `Anda mengunggah ${documentName}`
                            : `${entry.action.replace(/[_-]/g, ' ')} - ${documentName}`;
                    return (
                      <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{activityLabel}</span>
                        <time dateTime={entry.timestamp} title={formatJakartaDateTime(entry.timestamp)} className="shrink-0 text-[10px] text-slate-500">{formatJakartaDateTime(entry.timestamp)}</time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}

        {view === 'all' && activeRole === 'viewer' && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <section aria-labelledby="latest-viewer-documents-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="latest-viewer-documents-heading" className="font-bold text-ink">Dokumen Terbaru</h2><p className="mt-1 text-xs text-slate-500">Dokumen terbaru yang dibagikan kepada Anda.</p></div><Link href="/dashboard?view=documents" className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Semua dokumen</Link></div>
              <label className="relative mt-3 block">
                <span className="sr-only">Cari dokumen terbaru</span>
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">-</span>
                <input type="search" value={viewerDocumentSearch} onChange={(event) => setViewerDocumentSearch(event.target.value)} placeholder="Cari nama dokumen-" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              {loading ? <p role="status" className="py-7 text-sm text-slate-500">Memuat dokumen-</p> : error ? <p role="alert" className="py-7 text-sm text-rose-700">{error}</p> : viewerDashboardDocuments.length === 0 ? <p className="py-7 text-sm text-slate-500">{documentsByRole.viewer.length ? 'Dokumen tidak ditemukan. Coba kata kunci lain.' : 'Belum ada dokumen yang dibagikan kepada Anda.'}</p> : <ul className="mt-2 divide-y divide-slate-100">
                {viewerDashboardDocuments.slice(0, 5).map((document) => { const verified = document.status === 'VERIFIED'; const fresh = dashboardNow.getTime() - Date.parse(document.updatedAt) < 7 * 24 * 60 * 60 * 1000; return <li key={document.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-xs font-semibold text-slate-800">{document.name || document.fileName}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{verified ? 'Terverifikasi' : documentStatusLabel(document.status)}</span>{fresh && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">Baru</span>}</span><span className="mt-1 block text-[10px] text-slate-500">Dibagikan {document.owner?.name ? `oleh ${document.owner.name}` : 'oleh Editor'} - {formatJakartaDateTime(document.updatedAt)} - v{document.currentVersion || 1}</span></span><Link href={`/documents/${encodeURIComponent(document.id)}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat</Link>{verified && <button type="button" onClick={() => void handleDownload(document)} disabled={downloadingId === document.id || document.scanStatus === 'INFECTED'} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{downloadingId === document.id ? 'Mengunduh-' : 'Unduh'}</button>}</li>; })}
              </ul>}
            </section>
            <section aria-labelledby="viewer-file-check-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 id="viewer-file-check-heading" className="font-bold text-ink">Cek keaslian file</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">Cari dokumen yang sudah dibagikan, lalu periksa keaslian file tersimpan menggunakan SHA-256.</p>
              <label className="relative mt-3 block"><span className="sr-only">Cari dokumen untuk diverifikasi</span><span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">-</span><input type="search" value={viewerVerificationSearch} onChange={(event) => setViewerVerificationSearch(event.target.value)} placeholder="Cari dokumen-" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              <label className="mt-3 block text-xs font-medium text-slate-600">Dokumen<select value={viewerAuthenticityDocument?.id || ''} onChange={(event) => setViewerVerificationDocumentId(event.target.value)} disabled={viewerAuthenticityDocuments.length === 0} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 disabled:bg-slate-50">{viewerAuthenticityDocuments.length === 0 ? <option value="">{filteredVerificationDocuments.length ? 'Tidak ada hasil yang cocok' : 'Belum ada dokumen yang dibagikan'}</option> : viewerAuthenticityDocuments.map((document) => <option key={document.id} value={document.id}>{document.name || document.fileName}</option>)}</select></label>
              {viewerAuthenticityDocument && verificationResults[viewerAuthenticityDocument.id] && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-xs font-semibold ${verificationResults[viewerAuthenticityDocument.id].valid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{verificationResults[viewerAuthenticityDocument.id].valid ? 'Hash cocok - file terverifikasi' : 'Hash tidak cocok - periksa keaslian file'}</p>}
              <button type="button" onClick={() => viewerAuthenticityDocument && setVerifyTarget(viewerAuthenticityDocument)} disabled={!viewerAuthenticityDocument} className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Verifikasi SHA-256</button>
            </section>            <section aria-labelledby="viewer-download-history-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3"><h2 id="viewer-download-history-heading" className="font-bold text-ink">Riwayat Unduhan Saya</h2><Link href="/dashboard?view=history" className="text-xs font-semibold text-blue-700 hover:underline">Lihat semua</Link></div>
              <label className="relative mt-3 block"><span className="sr-only">Cari riwayat unduhan</span><span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">-</span><input type="search" value={viewerDownloadSearch} onChange={(event) => setViewerDownloadSearch(event.target.value)} placeholder="Cari dokumen yang diunduh-" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
              {historyLoading ? <p role="status" className="py-6 text-sm text-slate-500">Memuat riwayat-</p> : historyError ? <p role="alert" className="py-6 text-sm text-rose-700">{historyError}</p> : viewerDownloadHistory.length === 0 ? <p className="py-6 text-sm text-slate-500">{historyEntries.some((entry) => entry.action.toLocaleLowerCase().includes('download')) ? 'Tidak ada hasil yang cocok.' : 'Belum ada unduhan yang tercatat.'}</p> : <ul className="mt-2 divide-y divide-slate-100">{viewerDownloadHistory.map((entry) => { const document = documentsByRole.viewer.find((item) => item.id === entry.documentId); const result = document ? verificationResults[document.id] : undefined; return <li key={entry.id} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{entry.documentName}{document ? ` - v${document.currentVersion || 1}` : ''}</span><time dateTime={entry.timestamp} className="mt-1 block text-[10px] text-slate-500">{formatJakartaDateTime(entry.timestamp)}</time></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${result?.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{result?.valid ? 'Hash cocok' : 'Belum dicek'}</span></li>; })}</ul>}
            </section>
          </div>
        )}
        {view === 'members' && (principalRole !== 'owner' || activeRole !== 'owner') && (
          <section aria-labelledby="members-access-heading" className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-amber-700">Akses berdasarkan role</p>
            <h1 id="members-access-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">Anggota & Role</h1>
            <p className="mt-2 text-sm text-slate-600">Pengelolaan anggota dan role tersedia untuk Admin XecureIT / Pengelola Utama pada dokumen yang dimilikinya.</p>
          </section>
        )}

        {view === 'members' && principalRole === 'owner' && activeRole === 'owner' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 id="members-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">Anggota &amp; Role</h1>
                <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">Anggota dan undangan ditampilkan berdasarkan akses pada dokumen milik Anda.</p>
              </div>
              <a href="#invite-member-form" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                + Undang via Email
              </a>
            </div>
            {membersError && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{membersError}</p>}
            {membersMessage && <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{membersMessage}</p>}
            <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-100 px-5 py-4 font-bold text-ink">Anggota ({membersLoaded ? uniqueMemberCount : '-'})</h2>
                {membersLoading ? (
                  <p role="status" className="px-5 py-10 text-center text-sm text-slate-500">Memuat anggota dan undangan-</p>
                ) : membersError ? (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">Perbaiki error di atas untuk melihat daftar anggota.</p>
                ) : documentsByRole.owner.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">Belum ada dokumen milik akun ini. Unggah dokumen untuk mulai mengundang anggota.</p>
                ) : memberShares.length === 0 && memberInvitations.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">Belum ada anggota atau undangan pada dokumen Anda.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {memberShares.map((share) => {
                      const document = documentsByRole.owner.find((item) => item.id === share.documentId);
                      return (
                        <li key={`share:${share.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{share.email.slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{share.user?.name || share.email}</span>
                            <span className="block truncate text-xs text-slate-500">{share.email} - {share.documentName}</span>
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${share.role === 'editor' ? 'bg-blue-50 text-blue-700' : share.role === 'owner' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-800'}`}>{share.role}</span>
                          <button type="button" disabled={!document || memberActionId === `share:${share.id}`} onClick={() => {
                            setMemberBeingEdited(share);
                            setMemberEditRole(share.role === 'editor' ? 'editor' : 'viewer');
                          }} disabled={share.role === 'owner' || !document || memberActionId === `share:${share.id}`} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">Ubah</button>
                          <button type="button" disabled={memberActionId === `share:${share.id}`} onClick={() => void handleRemoveMemberShare(share)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{memberActionId === `share:${share.id}` ? 'Menghapus-' : 'Hapus'}</button>
                        </li>
                      );
                    })}
                    {memberInvitations.filter((invitation) => invitation.status === 'pending').map((invitation) => {
                      const document = documentsByRole.owner.find((item) => item.id === invitation.documentId);
                      return (
                        <li key={`invitation:${invitation.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 text-xs font-bold text-amber-700">{invitation.email.slice(0, 1).toUpperCase()}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{invitation.email}</span>
                            <span className="block truncate text-xs text-slate-500">Undangan tertunda - {invitation.documentName}</span>
                          </span>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800">{invitation.role}</span>
                          <button type="button" disabled={memberActionId === `invitation:${invitation.id}`} onClick={() => void handleResendMemberInvitation(invitation)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Kirim ulang</button>
                          <button type="button" disabled={memberActionId === `invitation:${invitation.id}`} onClick={() => void handleRevokeMemberInvitation(invitation)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Batalkan</button>
                          {document && <span className="sr-only">{document.name}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <aside className="space-y-5">
                <section id="invite-member-form" className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="font-bold text-ink">Undang Anggota</h2>
                  <form onSubmit={handleInviteMember} className="mt-4 space-y-3">
                    <label className="block text-xs font-semibold text-slate-700">
                      Email
                      <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nama@instansi.ac.id" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      Dokumen
                      <select value={inviteDocumentId} onChange={(event) => setInviteDocumentId(event.target.value)} disabled={documentsByRole.owner.length === 0} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                        {documentsByRole.owner.length === 0 ? <option value="">Belum ada dokumen milik Anda</option> : documentsByRole.owner.map((document) => <option key={document.id} value={document.id}>{document.name || document.fileName}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      Role
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'editor' | 'viewer')} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                        <option value="editor">EDITOR</option>
                        <option value="viewer">VIEWER</option>
                      </select>
                    </label>
                    <button type="submit" disabled={!inviteDocumentId || memberActionId === 'invite'} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                      {memberActionId === 'invite' ? 'Mengirim-' : 'Kirim Undangan'}
                    </button>
                  </form>
                  <p className="mt-3 text-xs leading-5 text-slate-500">Undangan mengatur akses pada dokumen yang dipilih.</p>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="font-bold text-ink">{memberBeingEdited ? `Ubah Role: ${memberBeingEdited.user?.name || memberBeingEdited.email}` : 'Ubah Role'}</h2>
                  <label className="mt-3 block text-xs font-semibold text-slate-700">
                    Anggota dan dokumen
                    <select
                      value={memberBeingEdited?.id || ''}
                      onChange={(event) => {
                        const selected = memberShares.find((share) => share.id === event.target.value && share.role !== 'owner');
                        setMemberBeingEdited(selected || null);
                        if (selected) setMemberEditRole(selected.role === 'editor' ? 'editor' : 'viewer');
                      }}
                      disabled={memberShares.every((share) => share.role === 'owner')}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal disabled:bg-slate-50"
                    >
                      <option value="">{membersLoading ? 'Memuat anggota...' : memberShares.some((share) => share.role !== 'owner') ? 'Pilih anggota untuk diubah' : 'Belum ada role yang dapat diubah'}</option>
                      {memberShares.filter((share) => share.role !== 'owner').map((share) => (
                        <option key={share.id} value={share.id}>{share.user?.name || share.email} · {share.documentName} · {share.role.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                  {memberBeingEdited ? (
                    <form onSubmit={handleSaveMemberRole} className="mt-4 space-y-3">
                      <label className="block text-xs font-semibold text-slate-700">
                        Role akses dokumen
                        <select value={memberEditRole} onChange={(event) => setMemberEditRole(event.target.value as 'editor' | 'viewer')} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                          <option value="editor">EDITOR</option>
                          <option value="viewer">VIEWER</option>
                        </select>
                      </label>
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Perubahan berlaku untuk dokumen {memberBeingEdited.documentName} dan dikirim ke API akses.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setMemberBeingEdited(null)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600">Batal</button>
                        <button type="submit" disabled={memberActionId === `share:${memberBeingEdited.id}`} className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{memberActionId === `share:${memberBeingEdited.id}` ? 'Menyimpan-' : 'Simpan Role'}</button>
                      </div>
                    </form>
                  ) : <p className="mt-2 text-sm leading-5 text-slate-500">{membersLoading ? 'Memuat daftar anggota dan role akses...' : memberShares.some((share) => share.role !== 'owner') ? 'Pilih anggota di atas atau klik Ubah pada daftar untuk mengatur role akses dokumen.' : 'Bagikan dokumen kepada anggota terlebih dahulu agar role aksesnya dapat diatur di sini.'}</p>}
                </section>
              </aside>
            </div>
          </div>
        )}

        {view === 'revisions' && activeRole === 'editor' && (
          <section aria-labelledby="revisions-heading" className="space-y-4">
            <header>
              <h1 id="revisions-heading" className="text-2xl font-bold tracking-tight text-ink sm:text-[30px]">Revisi</h1>
              <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>
              <p className="mt-2 text-sm text-slate-600">Dokumen yang dikembalikan Owner. Perbaiki sesuai catatan, unggah versi baru, lalu pantau statusnya di daftar Dokumen.</p>
            </header>
            {versionsError && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{versionsError}</p>}
            {loading && documents.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">Memuat dokumen revisi...</p>
              : editorReturnedDocuments.length === 0 ? <section className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm"><h2 className="font-semibold text-ink">Tidak ada dokumen yang perlu direvisi</h2><p className="mt-2 text-sm text-slate-500">Dokumen yang dikembalikan Owner akan tampil di sini beserta catatannya.</p></section>
                : <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.9fr)]">
                  <div className="space-y-4">
                    {editorReturnedDocuments.map((document) => <article key={document.id} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${selectedVerificationDocument?.id === document.id ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'}`}>
                      <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-[10px] font-bold text-slate-500">DOC</span>
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{document.name || document.fileName}</h2><span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-800">Revisi diminta</span><span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-800">v{document.currentVersion || 1}</span></div><p className="mt-1 truncate text-xs text-slate-500">{document.fileName}</p></div>
                      </div>
                      <dl className="mt-4 space-y-2 border-b border-slate-100 pb-3 text-xs"><div className="grid grid-cols-[126px_minmax(0,1fr)] items-start gap-2"><dt className="text-slate-500">Diunggah</dt><dd className="whitespace-nowrap font-medium text-slate-700">{formatRevisionDateTime(document.createdAt)}</dd></div><div className="grid grid-cols-[126px_minmax(0,1fr)] items-start gap-2"><dt className="whitespace-nowrap text-slate-500">Dikembalikan Owner</dt><dd className="whitespace-nowrap font-medium text-slate-700">{formatRevisionDateTime(document.updatedAt)}</dd></div></dl>
                      <div className="mt-3 rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Catatan Owner</p><p className="mt-1 text-sm leading-5 text-amber-950">{document.statusNote || 'Owner belum menambahkan catatan. Hubungi Owner sebelum mengirim revisi.'}</p></div>
                      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setVersionTarget(document)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">Unggah versi baru</button><Link href={`/documents/${encodeURIComponent(document.id)}`} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Lihat dokumen</Link><button type="button" onClick={() => setSelectedVerificationId(document.id)} className="rounded-lg px-3 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Lihat riwayat versi</button></div>
                    </article>)}
                  </div>
                  <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-ink">Alur revisi</h2>
                    <ol className="mt-3 space-y-3 text-xs text-slate-700"><li className="border-b border-slate-100 pb-3">1. Baca catatan Owner pada dokumen.</li><li className="border-b border-slate-100 pb-3">2. Perbaiki file, lalu unggah sebagai versi baru.</li><li className="border-b border-slate-100 pb-3">3. Pantau status pemeriksaan Owner di halaman Dokumen.</li></ol>
                    {selectedVerificationDocument && editorReturnedDocuments.some((document) => document.id === selectedVerificationDocument.id) && <div className="mt-5"><h3 className="text-sm font-bold text-slate-900">Riwayat {selectedVerificationDocument.name || selectedVerificationDocument.fileName}</h3>{versionsLoading ? <p role="status" className="mt-3 text-xs text-slate-500">Memuat riwayat versi...</p> : selectedVersions.length === 0 ? <p className="mt-3 text-xs text-slate-500">Riwayat versi belum tersedia.</p> : <ol className="mt-2 divide-y divide-slate-100">{selectedVersions.map((version) => <li key={version.id} className="flex flex-wrap items-center gap-2 py-3 text-xs"><span className="min-w-[104px] font-semibold text-slate-800">v{version.version} diunggah</span><time className="ml-auto whitespace-nowrap text-right text-slate-500">{formatRevisionDateTime(version.createdAt)}</time></li>)}<li className="flex flex-wrap items-center gap-2 py-3 text-xs"><span className="min-w-[104px] font-semibold text-rose-700">v{selectedVerificationDocument.currentVersion || 1} dikembalikan</span><time className="ml-auto whitespace-nowrap text-right text-slate-500">{formatRevisionDateTime(selectedVerificationDocument.updatedAt)}</time></li><li className="flex items-center gap-2 py-3 text-xs"><span className="font-semibold text-slate-800">v{(selectedVerificationDocument.currentVersion || 1) + 1}</span><span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">Belum diunggah</span></li></ol>}</div>}
                  </aside>
                </div>}
          </section>
        )}
        {view === 'revisions' && activeRole !== 'editor' && <section className="rounded-2xl border border-amber-100 bg-white p-6"><h1 className="text-xl font-bold text-ink">Riwayat Revisi</h1><p className="mt-2 text-sm text-slate-600">Halaman ini tersedia untuk role Editor.</p></section>}

        {view === 'shared' && principalRole === 'owner' && activeRole === 'owner' && (
          <section aria-labelledby="shared-heading" className="space-y-5">
            <div>
              <h1 id="shared-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">Undangan &amp; Akses</h1>
              <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>
              <p className="mt-2 text-sm text-slate-500">Undang anggota via email dan atur siapa punya akses ke tiap dokumen.</p>
            </div>

            {(membersError || membersMessage) && <p role={membersError ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 text-sm ${membersError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{membersError || membersMessage}</p>}

            <div className="grid items-start gap-4 lg:grid-cols-[0.86fr_1.14fr]">
              <section aria-labelledby="send-invitation-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 id="send-invitation-heading" className="font-bold text-ink">Kirim Undangan</h2>
                <form onSubmit={handleInviteMember} className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-slate-600">Email
                    <input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="nama@email.com" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">Dokumen
                    <select value={inviteDocumentId} onChange={(event) => setInviteDocumentId(event.target.value)} disabled={documentsByRole.owner.length === 0} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50">
                      {documentsByRole.owner.length === 0 ? <option value="">Belum ada dokumen milik Anda</option> : documentsByRole.owner.map((document) => <option key={document.id} value={document.id}>{document.name || document.fileName}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">Role di dokumen ini
                    <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as 'editor' | 'viewer')} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500">
                      <option value="viewer">Viewer - lihat dan unduh</option>
                      <option value="editor">Editor - kelola dokumen</option>
                    </select>
                  </label>
                  <button type="submit" disabled={!inviteDocumentId || !inviteEmail.trim() || memberActionId === 'invite'} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {memberActionId === 'invite' ? 'Mengirim-' : 'Kirim undangan'}
                  </button>
                  <p className="text-[11px] leading-4 text-slate-500">Undangan dikirim melalui email. Masa berlaku mengikuti kebijakan server.</p>
                </form>
              </section>

              <div className="space-y-4">
                <section aria-labelledby="pending-invitations-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center gap-2"><h2 id="pending-invitations-heading" className="font-bold text-ink">Undangan Tertunda</h2><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{memberInvitations.filter((invitation) => invitation.status === 'pending').length}</span></div>
                  {membersLoading ? <p role="status" className="py-7 text-sm text-slate-500">Memuat undangan-</p> : membersError && !membersLoaded ? <p role="alert" className="py-7 text-sm text-rose-700">{membersError}</p> : memberInvitations.filter((invitation) => invitation.status === 'pending').length === 0 ? <p className="py-7 text-sm text-slate-500">Belum ada undangan tertunda.</p> : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600"><tr><th className="rounded-l-lg px-3 py-2.5">Undangan</th><th className="px-3 py-2.5">Dikirim</th><th className="rounded-r-lg px-3 py-2.5">Aksi</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {memberInvitations.filter((invitation) => invitation.status === 'pending').map((invitation) => (
                            <tr key={invitation.id}>
                              <td className="px-3 py-3"><span className="block font-semibold text-slate-800">{invitation.email}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${invitation.role === 'editor' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{roleLabel(invitation.role)}</span><span className="mt-1 block max-w-[180px] truncate text-[10px] text-slate-500">{invitation.documentName}</span></td>
                              <td className="whitespace-nowrap px-3 py-3 text-slate-600"><span className="block">{formatJakartaDateTime(invitation.createdAt)}</span><span className="mt-1 block text-[10px]">berlaku s/d {formatJakartaDateTime(invitation.expiresAt)}</span></td>
                              <td className="px-3 py-2"><div className="flex flex-col items-start gap-1"><button type="button" disabled={memberActionId === `invitation:${invitation.id}`} onClick={() => void handleResendMemberInvitation(invitation)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Kirim ulang</button><button type="button" disabled={memberActionId === `invitation:${invitation.id}`} onClick={() => void handleRevokeMemberInvitation(invitation)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batalkan</button></div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section aria-labelledby="document-access-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 id="document-access-heading" className="font-bold text-ink">Akses per Dokumen</h2>
                  {membersLoading ? <p role="status" className="py-7 text-sm text-slate-500">Memuat akses-</p> : documentsByRole.owner.length === 0 ? <p className="py-7 text-sm text-slate-500">Belum ada dokumen milik Anda.</p> : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[500px] text-left text-xs">
                        <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-600"><tr><th className="rounded-l-lg px-3 py-2.5">Dokumen</th><th className="px-3 py-2.5">Editor</th><th className="px-3 py-2.5">Viewer</th><th className="rounded-r-lg px-3 py-2.5" /></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {documentsByRole.owner.map((document) => {
                            const shares = memberShares.filter((share) => share.documentId === document.id);
                            return <tr key={document.id}><td className="max-w-[230px] truncate px-3 py-3.5 font-medium text-slate-800">{document.name || document.fileName}</td><td className="px-3 py-3.5 text-slate-700">{shares.filter((share) => share.role === 'editor').length}</td><td className="px-3 py-3.5 text-slate-700">{shares.filter((share) => share.role === 'viewer').length}</td><td className="px-3 py-2.5 text-right"><button type="button" onClick={() => setShareTarget(document)} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">Kelola</button></td></tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        )}

        {view === 'shared' && !(principalRole === 'owner' && activeRole === 'owner') && (
          <section aria-labelledby="shared-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div>
                {activeRole === 'owner' && <p className="text-sm font-semibold text-blue-600">Pengelolaan akses</p>}
                <h1 id="shared-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">{activeRole === 'owner' ? 'Undangan & Akses' : activeRole === 'editor' ? 'Undangan & Dokumen Dibagikan' : 'Dokumen yang Dibagikan'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  {activeRole === 'owner'
                      ? 'Tinjau dokumen yang sudah dibagikan, lalu kelola penerima, role, dan undangan pada dokumen terkait.'
                      : activeRole === 'editor'
                        ? 'Dokumen yang dibagikan kepada Anda dan informasi akses kolaborasi yang tersedia akan muncul di sini.'
                        : 'Dokumen yang dapat Anda akses melalui pembagian atau kolaborasi akan muncul di sini.'}
                </p>
              </div>
              <button onClick={() => void loadDocuments()} disabled={loading} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {loading ? 'Memuat-' : 'Muat ulang'}
              </button>
            </div>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:px-6">
              <label className="relative flex-1">
                <span className="sr-only">Cari dokumen dibagikan</span>
                <input
                  type="search"
                  value={sharedQuery}
                  onChange={(event) => setSharedQuery(event.target.value)}
                  placeholder={DOCUMENT_CONTEXT.searchPlaceholder}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label>
                <span className="sr-only">Filter izin akses</span>
                <select
                  value={sharedRoleFilter}
                  onChange={(event) => setSharedRoleFilter(event.target.value as 'all' | DocumentRole)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm capitalize outline-none focus:border-blue-500 sm:w-44"
                >
                  <option value="all">Semua izin</option>
                  <option value="owner">{roleLabel('owner')}</option>
                  <option value="editor">{roleLabel('editor')}</option>
                  <option value="viewer">{roleLabel('viewer')}</option>
                </select>
              </label>
            </div>
            {error && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">{error}</p>}
            {loading && documents.length === 0 ? (
              <p className="px-5 py-16 text-center text-sm text-slate-500">Memuat daftar dokumen-</p>
            ) : error && documents.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm text-slate-600">Dokumen dibagikan belum dapat dimuat.</p>
                <button onClick={() => void loadDocuments()} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Coba lagi</button>
              </div>
            ) : filteredSharedDocuments.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <h2 className="font-bold text-ink">{sharedDocuments.length === 0 ? 'Belum ada dokumen dibagikan' : 'Tidak ada dokumen yang cocok'}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {sharedDocuments.length === 0
                    ? 'Dokumen yang dibagikan kepada Anda atau memiliki kolaborator akan muncul di sini.'
                    : 'Ubah kata kunci atau filter izin untuk melihat dokumen lain.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th scope="col" className="px-6 py-3">Dokumen</th>
                      <th scope="col" className="px-4 py-3">Pemilik</th>
                      <th scope="col" className="px-4 py-3">Izin akses</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Diperbarui</th>
                      <th scope="col" className="px-5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSharedDocuments.map((document) => {
                      const role = documentRole(document, userId);
                      return (
                        <tr key={document.id} className="hover:bg-slate-50/70">
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-slate-800">{document.name || document.fileName}</p>
                            <p className="mt-1 text-xs text-slate-400">{document.fileName}</p>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{document.owner?.name || document.owner?.email || 'Pemilik dokumen'}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{roleLabel(role)}</span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${documentStatusClass(document.status)}`}>
                                {documentStatusLabel(document.status)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs font-medium text-emerald-700">Akses tersedia</span>
                            {document.statusNote && <p className="mt-1 text-[11px] text-slate-400">{document.statusNote}</p>}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatJakartaDateTime(document.updatedAt)}</td>
                          <td className="px-5 py-4 text-right">
                            <Link href={`/documents/${encodeURIComponent(document.id)}`} className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Detail</Link>
                            {principalRole !== 'viewer' && role !== 'viewer' && (
                              <button type="button" onClick={() => setShareTarget(document)} className="ml-1 inline-flex rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Kelola akses</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {view === 'history' && activeRole === 'viewer' && renderHistoryPanel()}

        {view === 'history' && activeRole !== 'viewer' && (
          <section aria-labelledby="history-access-heading" className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-amber-700">Akses berdasarkan role</p>
            <h1 id="history-access-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">Riwayat Saya</h1>
            <p className="mt-2 text-sm text-slate-600">Halaman ini hanya tersedia pada tampilan Penerima / Mahasiswa.</p>
          </section>
        )}

        {view === 'verify' && (
          <section aria-labelledby="verify-heading" className="space-y-4">
            <header>
              <h1 id="verify-heading" className="text-2xl font-bold tracking-tight text-ink sm:text-[30px]">Verifikasi SHA-256</h1>
              <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>
              <p className="mt-2 text-sm text-slate-600">Cek file unggahan atau periksa file tersimpan di server terhadap hash yang tercatat.</p>
            </header>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            {loading && documents.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">Memuat dokumen...</p>
              : error && documents.length === 0 ? <p className="rounded-xl border border-rose-100 bg-white px-5 py-12 text-center text-sm text-rose-700">Daftar dokumen belum dapat dimuat.</p>
                : <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.25fr)]">
                  <section aria-label="Cek file unggahan" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-ink">Cek File Unggahan</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Pilih dokumen dan file dari perangkat. Hash file dihitung di browser lalu dibandingkan dengan hash versi aktif.</p>
                    <label className="mt-4 block text-xs font-medium text-slate-600">Dokumen dan versi
                      <select value={selectedVerificationDocument?.id || ''} onChange={(event) => { setSelectedVerificationId(event.target.value); setUploadedFileHashResult(null); }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800">
                        {filteredVerificationDocuments.length === 0 && <option value="">Belum ada dokumen tersedia</option>}
                        {filteredVerificationDocuments.map((document) => <option key={document.id} value={document.id}>{document.name || document.fileName} - v{document.currentVersion || 1}</option>)}
                      </select>
                    </label>
                    <label className="mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 text-center hover:border-blue-400 hover:bg-blue-50/40" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setVerificationUploadFile(event.dataTransfer.files[0] || null); setUploadedFileHashResult(null); }}>
                      <span className="text-sm font-medium text-slate-700">{verificationUploadFile?.name || 'Seret file ke sini atau pilih file'}</span>
                      <span className="mt-1 text-xs text-slate-500">Hash dihitung di perangkat</span>
                      <input type="file" className="sr-only" onChange={(event) => { setVerificationUploadFile(event.target.files?.[0] || null); setUploadedFileHashResult(null); }} />
                    </label>
                    <button type="button" disabled={!selectedVerificationDocument || !verificationUploadFile || versionsLoading} onClick={async () => {
                      if (!selectedVerificationDocument || !verificationUploadFile) return;
                      try {
                        const bytes = await verificationUploadFile.arrayBuffer();
                        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
                        const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
                        const recordedVersion = selectedVersions.find((version) => version.version === (selectedVerificationDocument.currentVersion || 1)) || selectedVersions[0];
                        const expectedHash = recordedVersion?.sha256 || verificationResults[selectedVerificationDocument.id]?.expectedHash || null;
                        setUploadedFileHashResult({ actualHash, expectedHash, matches: expectedHash ? actualHash.toLowerCase() === expectedHash.toLowerCase() : null });
                      } catch {
                        setUploadedFileHashResult(null);
                      }
                    }} className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Hitung &amp; Bandingkan</button>
                    {uploadedFileHashResult && <div role="status" className={`mt-4 rounded-xl border p-4 ${uploadedFileHashResult.matches === true ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : uploadedFileHashResult.matches === false ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                      <p className="font-semibold">{uploadedFileHashResult.matches === true ? 'File cocok dengan versi tercatat' : uploadedFileHashResult.matches === false ? 'Hash file berbeda dari versi tercatat' : 'Hash versi tercatat belum tersedia'}</p>
                      <dl className="mt-3 divide-y divide-current/10 text-xs"><div className="flex justify-between gap-3 py-2"><dt>Hash file</dt><dd className="max-w-[65%] break-all text-right font-mono">{uploadedFileHashResult.actualHash}</dd></div><div className="flex justify-between gap-3 py-2"><dt>Hash tercatat</dt><dd className="max-w-[65%] break-all text-right font-mono">{uploadedFileHashResult.expectedHash || 'Tidak tersedia'}</dd></div></dl>
                    </div>}
                  </section>

                  <section aria-label="Pemeriksaan file tersimpan" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-5"><div><h2 className="text-lg font-bold text-ink">Pemeriksaan File Tersimpan</h2><p className="mt-1 max-w-lg text-xs text-slate-500">Hash dihitung ulang oleh server saat pemeriksaan dijalankan.</p></div>
                      <button type="button" onClick={async () => {
                        setVerifyAllLoading(true);
                        const checks = await Promise.allSettled(filteredVerificationDocuments.map(async (document) => ({ id: document.id, result: await verifyDocumentHash(document.id) })));
                        setVerificationResults((current) => { const next = { ...current }; checks.forEach((check) => { if (check.status === 'fulfilled') next[check.value.id] = check.value.result; }); return next; });
                        setVerifyAllLoading(false);
                      }} disabled={verifyAllLoading || filteredVerificationDocuments.length === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{verifyAllLoading ? 'Memeriksa...' : 'Periksa ulang semua'}</button>
                    </div>
                    <div className="overflow-x-auto px-4"><table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th scope="col" className="rounded-l-lg px-3 py-3">Dokumen - versi</th><th scope="col" className="px-3 py-3">Hash tercatat</th><th scope="col" className="px-3 py-3">File server</th><th scope="col" className="rounded-r-lg px-3 py-3">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{filteredVerificationDocuments.length === 0 ? <tr><td colSpan={4} className="px-3 py-10 text-center text-xs text-slate-500">Belum ada dokumen yang bisa diperiksa.</td></tr> : filteredVerificationDocuments.map((document) => {
                        const result = verificationResults[document.id];
                        return <tr key={document.id} className="hover:bg-slate-50/70"><td className="max-w-[220px] px-3 py-3"><span className="block truncate text-xs font-medium text-slate-800">{document.name || document.fileName} - v{document.currentVersion || 1}</span><button type="button" onClick={() => setVerifyTarget(document)} className="mt-1 text-[11px] font-semibold text-blue-700 hover:underline">Periksa</button></td><td className="max-w-[150px] truncate px-3 py-3 font-mono text-[10px] text-slate-600" title={document.sha256 || result?.expectedHash || ''}>{document.sha256 || result?.expectedHash || 'Belum diperiksa'}</td><td className="max-w-[150px] truncate px-3 py-3 font-mono text-[10px] text-slate-600" title={result?.actualHash || ''}>{result?.actualHash || 'Belum diperiksa'}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${result ? result.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{result ? result.valid ? 'Cocok' : result.status === 'FILE_MISSING' ? 'File hilang' : 'Tidak cocok' : 'Belum dicek'}</span>{result && <span className="mt-1 block whitespace-nowrap text-[10px] text-slate-400">{formatJakartaDateTime(result.verifiedAt)}</span>}</td></tr>;
                      })}</tbody>
                    </table></div>
                    <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Pemeriksaan server membandingkan file aktif dengan hash versi yang tercatat.</p>
                  </section>
                </div>}
          </section>
        )}

        {view === 'audit' && (principalRole === 'viewer' || activeRole === 'viewer') && (
          <section aria-labelledby="audit-access-heading" className="rounded-2xl border border-amber-100 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold text-amber-700">Akses berdasarkan peran</p>
            <h1 id="audit-access-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">Audit trail global</h1>
            <p className="mt-2 text-sm text-slate-600">Panel audit global hanya tersedia pada tampilan Admin XecureIT / Pengelola Utama. Pratinjau peran tidak mengubah izin API.</p>
          </section>
        )}

        {view === 'audit' && principalRole === 'owner' && activeRole === 'owner' && (
          <div className="space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 id="audit-heading" className="text-2xl font-bold tracking-tight text-ink">Audit Trail</h1>
                <p className="mt-1 inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"><JakartaClock /></p>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">Catatan aktivitas dokumen yang tercatat oleh sistem dan disusun dari waktu terbaru.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
                  const rows = [['Waktu', 'Pelaku', 'Aksi', 'Dokumen', 'Detail', 'Alamat IP'], ...filteredAuditEntries.map((entry) => [entry.timestamp, typeof entry.actor === 'string' ? entry.actor : entry.actor?.name || entry.actor?.email || 'Sistem', auditActionPresentation(entry.action).label, entry.documentName, entry.details || '', entry.ipAddress || ''])];
                  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'audit-trail.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                }} disabled={auditLoading || filteredAuditEntries.length === 0} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Ekspor CSV</button>
                <button type="button" onClick={() => {
                  setAuditPage(1);
                  void loadDocuments();
                  setAuditRefreshKey((current) => current + 1);
                }} disabled={auditLoading || loading} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {auditLoading || loading ? 'Memuat-' : 'Muat ulang'}
                </button>
              </div>
            </header>

            <section aria-label="Ringkasan audit trail" className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Total entri tersedia</p><p className="mt-2 text-2xl font-bold text-ink">{auditEntries.length.toLocaleString('id-ID')}</p><span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">Maksimal 100 per dokumen</span></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Status pemuatan</p><p className="mt-2 text-2xl font-bold text-ink">{auditLoading ? 'Memuat' : auditError ? 'Perlu diperiksa' : 'Tersedia'}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${auditError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{auditError ? 'Sebagian data gagal dimuat' : 'Data berhasil disinkronkan'}</span></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">Aktivitas terbaru</p>
                {auditEntries[0] ? <>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${auditActionPresentation(auditEntries[0].action).className}`}>{auditActionPresentation(auditEntries[0].action).label}</span>
                    <time className="text-[11px] text-slate-500">{formatJakartaDateTime(auditEntries[0].timestamp)}</time>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-ink">{auditEntries[0].documentName}</p>
                  <p className="mt-1 truncate text-xs text-slate-600">Pelaku: {typeof auditEntries[0].actor === 'string' ? auditEntries[0].actor : auditEntries[0].actor?.name || auditEntries[0].actor?.email || 'Sistem'}</p>
                  {auditEntries[0].details && <p className="mt-1 truncate text-[11px] text-slate-500">{auditEntries[0].details}</p>}
                </> : <p className="mt-2 text-sm font-semibold text-slate-600">{auditLoading ? 'Memuat aktivitas...' : auditError ? 'Aktivitas gagal dimuat' : 'Belum ada aktivitas audit'}</p>}
              </div>
            </section>

            <section aria-label="Filter audit trail" className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="text-xs font-medium text-slate-600">Cari
                <input type="search" value={auditQuery} onChange={(event) => { setAuditQuery(event.target.value); setAppliedAuditFilters((current) => ({ ...current, query: event.target.value })); setAuditPage(1); }} placeholder="Pelaku atau dokumen" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal" />
              </label>
              <label className="text-xs font-medium text-slate-600">Aksi
                <select value={auditActionFilter} onChange={(event) => { setAuditActionFilter(event.target.value); setAppliedAuditFilters((current) => ({ ...current, action: event.target.value })); setAuditPage(1); }} className="mt-1 min-w-32 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="">Semua aksi</option>{Array.from(new Set(auditEntries.map((entry) => auditActionPresentation(entry.action).label))).sort().map((action) => <option key={action} value={action}>{action}</option>)}</select>
              </label>
              <label className="text-xs font-medium text-slate-600">Dokumen
                <select value={auditDocumentId} onChange={(event) => { setAuditDocumentId(event.target.value); setAuditPage(1); }} className="mt-1 min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="all">Semua dokumen</option>{auditDocuments.map((document) => <option key={document.id} value={document.id}>{document.name || document.fileName}</option>)}</select>
              </label>
            </section>

            <section aria-label="Log audit trail" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 pb-3 pt-4"><h2 className="font-bold text-ink">Aktivitas Terbaru <span className="ml-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">Immutabel</span></h2></div>
              <div className="overflow-x-auto">
                <table className="mx-4 mb-2 w-[calc(100%-2rem)] min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <tr><th scope="col" className="px-3 py-2.5">Waktu</th><th scope="col" className="px-3 py-2.5">Pelaku</th><th scope="col" className="px-3 py-2.5">Aksi</th><th scope="col" className="px-3 py-2.5">Dokumen</th><th scope="col" className="px-3 py-2.5">Alamat IP</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && documents.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Memuat dokumen audit-</td></tr>
                      : error && documents.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-rose-700">{error}</td></tr>
                      : auditDocuments.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Belum ada dokumen dengan riwayat audit.</td></tr>
                      : auditLoading ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Memuat aktivitas-</td></tr>
                      : auditError ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-rose-700">{auditError}</td></tr>
                      : filteredAuditEntries.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">{auditEntries.length === 0 ? 'Belum ada aktivitas audit.' : 'Tidak ada aktivitas yang cocok dengan pencarian.'}</td></tr>
                      : paginatedAuditEntries.map((entry) => {
                        const action = auditActionPresentation(entry.action);
                        return <tr key={entry.id} className="text-slate-700 hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{formatJakartaDateTime(entry.timestamp)}</td>
                          <td className="px-3 py-2.5 text-xs">{typeof entry.actor === 'string' ? entry.actor : entry.actor?.name || entry.actor?.email || 'Sistem'}</td>
                          <td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${action.className}`}>{action.label}</span></td>
                          <td className="px-3 py-2.5 text-xs"><span className="block">{entry.documentName}</span>{entry.details && <span className="mt-1 block max-w-[280px] truncate text-[11px] text-slate-400">{entry.details}</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{entry.ipAddress || '-'}</td>
                        </tr>;
                      })}
                  </tbody>
                </table>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                <span>Menampilkan {paginatedAuditEntries.length} dari {filteredAuditEntries.length} entri cocok - API menyediakan hingga 100 entri per dokumen.</span>
                {filteredAuditEntries.length > 0 && !auditLoading && !auditError && <nav aria-label="Navigasi audit trail" className="flex items-center gap-2"><button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => Math.max(1, page - 1))} className="rounded border border-slate-200 px-2.5 py-1.5 disabled:opacity-40">Sebelumnya</button><span>Halaman {auditPage} dari {auditPageCount}</span><button type="button" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage((page) => Math.min(auditPageCount, page + 1))} className="rounded border border-slate-200 px-2.5 py-1.5 disabled:opacity-40">Berikutnya</button></nav>}
              </footer>
            </section>
          </div>
        )}
        {view === 'audit' && principalRole === 'owner' && activeRole !== 'owner' && activeRole !== 'editor' && (
          <section aria-labelledby="audit-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div>
                {activeRole !== 'editor' && <p className="text-sm font-semibold text-blue-600">{principalRole === 'owner' ? 'Admin XecureIT / Pengelola Utama' : 'Penerbit / Instansi'}</p>}
                <h1 id="audit-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">{principalRole === 'owner' ? 'Audit Trail' : 'Audit dokumen'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500">
                  {principalRole === 'owner'
                    ? 'Gabungan aktivitas dari seluruh dokumen yang dapat diakses akun ini. Sumber API menyediakan audit per dokumen.'
                    : 'Tinjau aktivitas pada dokumen instansi yang dapat Anda kelola. Sumber API menyediakan audit per dokumen.'}
                </p>
              </div>
              <button onClick={() => setAuditRefreshKey((current) => current + 1)} disabled={auditLoading || documents.length === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {auditLoading ? 'Memuat-' : 'Muat ulang'}
              </button>
            </div>
            {error && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">{error}</p>}
            {loading && documents.length === 0 ? (
              <p className="px-5 py-16 text-center text-sm text-slate-500">Memuat daftar dokumen-</p>
            ) : error && documents.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm text-slate-600">Dokumen untuk audit trail belum dapat dimuat.</p>
                <button onClick={() => void loadDocuments()} className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Coba lagi</button>
              </div>
            ) : auditDocuments.length === 0 ? (
              <p className="px-5 py-16 text-center text-sm text-slate-500">Belum ada dokumen dengan riwayat audit.</p>
            ) : (
              <>
                <div className="space-y-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <label className="block max-w-md text-xs font-semibold text-slate-600">
                    Cakupan dokumen
                    <select value={auditDocumentId} onChange={(event) => setAuditDocumentId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-500">
                      <option value="all">{principalRole === 'owner' ? 'Semua dokumen yang dapat diakses' : 'Semua dokumen instansi'}</option>
                      {auditDocuments.map((document) => (
                        <option key={document.id} value={document.id}>{document.name || document.fileName}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="text-xs font-semibold text-slate-600">User
                      <input value={auditUserFilter} onChange={(event) => setAuditUserFilter(event.target.value)} placeholder="Semua user" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Aksi
                      <input value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} placeholder="Semua aksi" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Dari tanggal
                      <input type="date" value={auditFromDate} onChange={(event) => setAuditFromDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Sampai tanggal
                      <input type="date" value={auditToDate} onChange={(event) => setAuditToDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
                    </label>
                    <div className="flex items-end gap-2">
                      <button type="button" onClick={() => {
                        setAppliedAuditFilters({ user: auditUserFilter, action: auditActionFilter, from: auditFromDate, to: auditToDate, query: auditQuery });
                        setAuditPage(1);
                      }} className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Terapkan</button>
                      <button type="button" onClick={() => {
                        setAuditUserFilter('');
                        setAuditActionFilter('');
                        setAuditFromDate('');
                        setAuditToDate('');
                        setAuditQuery('');
                        setAppliedAuditFilters({ user: '', action: '', from: '', to: '', query: '' });
                        setAuditPage(1);
                      }} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Reset</button>
                    </div>
                  </div>
                  <label className="block max-w-md text-xs font-semibold text-slate-600">
                    Cari detail aktivitas
                    <input type="search" value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Cari target atau detail-" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" />
                  </label>
                </div>
                {auditError && <p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-6">{auditError}</p>}
                {auditLoading ? (
                  <p className="px-5 py-12 text-center text-sm text-slate-500">Memuat aktivitas-</p>
                ) : auditError ? (
                  <div className="px-5 py-12 text-center">
                    <button onClick={() => setAuditRefreshKey((current) => current + 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Coba lagi</button>
                  </div>
                ) : filteredAuditEntries.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-slate-500">
                    {auditEntries.length === 0 ? 'Belum ada aktivitas yang tercatat.' : 'Tidak ada aktivitas yang cocok dengan pencarian.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th scope="col" className="px-5 py-3">Waktu</th>
                          <th scope="col" className="px-4 py-3">Aktor</th>
                          <th scope="col" className="px-4 py-3">Aksi</th>
                          <th scope="col" className="px-4 py-3">Target</th>
                          <th scope="col" className="px-5 py-3">IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedAuditEntries.map((entry) => (
                          <tr key={entry.id} className="text-slate-600 hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatJakartaDateTime(entry.timestamp)}</td>
                            <td className="px-4 py-4">{typeof entry.actor === 'string' ? entry.actor : entry.actor?.name || entry.actor?.email || 'Sistem'}</td>
                            <td className="px-4 py-4 font-medium text-slate-800">{entry.action.replace(/[_-]/g, ' ')}</td>
                            <td className="px-4 py-4">
                              <span className="block">{entry.documentName}</span>
                              {entry.details && <span className="mt-1 block max-w-[260px] truncate text-xs text-slate-400">{entry.details}</span>}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{entry.ipAddress || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  <span>Log immutable - API menyediakan audit per dokumen, hingga 100 entri terbaru per dokumen.</span>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={auditPage <= 1} onClick={() => setAuditPage((page) => Math.max(1, page - 1))} className="rounded border border-slate-200 px-2.5 py-1.5 disabled:opacity-40">Sebelumnya</button>
                    <span>Halaman {auditPage} dari {auditPageCount}</span>
                    <button type="button" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage((page) => Math.min(auditPageCount, page + 1))} className="rounded border border-slate-200 px-2.5 py-1.5 disabled:opacity-40">Berikutnya</button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>
      {versionPickerOpen && canUploadDocument && activeRole !== 'viewer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="version-picker-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-600">Revisi dokumen instansi</p>
                <h2 id="version-picker-title" className="mt-1 text-xl font-bold text-ink">Pilih dokumen untuk diperbarui</h2>
              </div>
              <button type="button" aria-label="Tutup" onClick={() => setVersionPickerOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">-</button>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-700">
              Dokumen
              <select
                value={versionPickerSelection}
                onChange={(event) => setVersionPickerSelection(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500"
              >
                {versionCandidates.map((document) => (
                  <option key={document.id} value={document.id}>{document.name || document.fileName}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs leading-5 text-slate-500">Pilih dokumen yang Anda kelola. File yang diunggah akan ditambahkan sebagai versi terbaru.</p>
            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setVersionPickerOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button>
              <button
                type="button"
                onClick={() => {
                  const selectedDocument = versionCandidates.find((document) => document.id === versionPickerSelection);
                  if (!selectedDocument) {
                    setActionError('Pilih dokumen yang valid untuk mengunggah versi baru.');
                    return;
                  }
                  setVersionPickerOpen(false);
                  setVersionTarget(selectedDocument);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Lanjut unggah
              </button>
            </div>
          </section>
        </div>
      )}
      {editTarget && principalRole === 'owner' && activeRole === 'owner' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-document-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <h2 id="edit-document-title" className="text-xl font-bold text-ink">Perbarui Dokumen</h2>
            <form onSubmit={(event) => { event.preventDefault(); void handleUpdateDocument(); }} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Nama dokumen
                <input required maxLength={200} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Deskripsi
                <textarea maxLength={2000} rows={4} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-normal" />
              </label>
              {actionError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{actionError}</p>}
              <div className="flex justify-end gap-3">
                <button type="button" disabled={editLoading} onClick={() => setEditTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Batal</button>
                <button type="submit" disabled={editLoading || !editTitle.trim()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{editLoading ? 'Menyimpan-' : 'Simpan Perubahan'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {canUploadDocument && activeRole !== 'viewer' && <UploadDocumentModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={addDocument} />}
      {versionTarget && principalRole !== 'viewer' && activeRole !== 'viewer' && (documentRole(versionTarget, userId) === 'owner' || documentRole(versionTarget, userId) === 'editor') && (
        <UploadDocumentModal
          documentId={versionTarget.id}
          initialFile={versionUploadFile}
          isOpen
          onClose={() => {
            setVersionTarget(null);
            setVersionUploadFile(null);
          }}
          onUploaded={(updatedDocument) => {
            addDocument(updatedDocument);
            void loadDocuments();
            setVersionTarget(null);
            setVersionUploadFile(null);
          }}
        />
      )}
      {shareTarget && (
        <ShareDocumentModal
          documentId={shareTarget.id}
          isOpen
          allowOwnerRole={principalRole === 'owner' && activeRole === 'owner' && documentRole(shareTarget, userId) === 'owner'}
          onClose={() => setShareTarget(null)}
          onShared={() => {
            void loadDocuments();
            setMembersRefreshKey((current) => current + 1);
          }}
        />
      )}
      {verifyTarget && (
        <HashVerifyModal
          documentId={verifyTarget.id}
          isOpen
          onClose={() => setVerifyTarget(null)}
          onVerified={(result) => setVerificationResults((current) => ({ ...current, [verifyTarget.id]: result }))}
        />
      )}
    </div>
  );
}
