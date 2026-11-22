import type {
  AuditTrailItem,
  Document,
  DocumentInvitation,
  DocumentRole,
  DocumentShare,
  DocumentVersion,
  HashVerificationResult,
  InvitationStatus,
  User,
} from '@/types/document';
import { isScanStatus, type DocumentStatus } from '@/lib/labels';

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
).replace(/\/+$/, '');
export const SSE_BASE_URL = (
  process.env.NEXT_PUBLIC_SSE_URL || `${API_BASE_URL}/documents`
).replace(/\/+$/, '');

const SESSION_KEY = 'secure-doc-session';
type ApiRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface AuthSession {
  token: string;
  user: User;
}

type ApiUser = Omit<User, 'role'> & { role?: string };

interface ApiDocument {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  status?: unknown;
  statusNote?: unknown;
  scanStatus?: unknown;
  role?: ApiRole;
  owner?: ApiUser;
  shares?: Array<{ role: ApiRole }>;
  _count?: { versions?: number; shares?: number };
}

interface ApiVersion {
  id: string;
  documentId?: string;
  versionNumber: number;
  hash: string;
  createdAt: string;
  createdById?: string;
  createdBy?: ApiUser;
  changeNote?: unknown;
  scanStatus?: unknown;
}

interface ApiShare {
  id: string;
  documentId: string;
  userId: string;
  role: ApiRole;
  createdAt: string;
  user: ApiUser;
}

interface ApiInvitation {
  id: string;
  documentId: string;
  email: string;
  role: ApiRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  invitedBy?: ApiUser;
}

interface ApiAuditEntry {
  id: string;
  action: string;
  actor: ApiUser | null;
  createdAt: string;
  details?: unknown;
  ipAddress?: string | null;
}

export type ShareResult =
  | { type: 'SHARE'; created: boolean; share: DocumentShare }
  | { type: 'INVITATION'; invitation: DocumentInvitation };

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRole(role?: string): DocumentRole | undefined {
  switch (role) {
    case 'OWNER':
    case 'owner':
      return 'owner';
    case 'EDITOR':
    case 'editor':
      return 'editor';
    case 'VIEWER':
    case 'viewer':
      return 'viewer';
    default:
      return undefined;
  }
}

function fromRole(role: DocumentRole): ApiRole {
  switch (role) {
    case 'owner':
      return 'OWNER';
    case 'editor':
      return 'EDITOR';
    case 'viewer':
      return 'VIEWER';
  }
}

function toDocumentStatus(value: unknown): DocumentStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const status = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (status === 'PENDING_VERIFICATION' || status === 'PENDING' || status === 'SUBMITTED') return 'PENDING_VERIFICATION';
  if (status === 'VERIFIED' || status === 'APPROVED' || status === 'ACCEPTED') return 'VERIFIED';
  if (status === 'REVOKED' || status === 'REVOKE') return 'REVOKED';
  if ([
    'REJECTED',
    'RETURNED',
    'RETURNED_TO_EDITOR',
    'RETURNED_FOR_REVISION',
    'REVISION',
    'REVISION_REQUIRED',
    'REVISION_REQUESTED',
    'NEEDS_REVISION',
    'CHANGES_REQUESTED',
    'DECLINED',
  ].includes(status)) return 'REJECTED';
  return undefined;
}

function mapUser(user: ApiUser): User {
  const { role: apiRole, ...userDetails } = user;
  const role = toRole(apiRole);
  return { ...userDetails, ...(role ? { role } : {}) };
}

function mapDocument(document: ApiDocument): Document {
  const role =
    toRole(document.role) ||
    toRole(document.shares?.[0]?.role) ||
    (document.ownerId ? undefined : 'viewer');
  return {
    id: document.id,
    ownerId: document.ownerId,
    name: document.title,
    description: document.description,
    fileName: document.filename,
    mimeType: document.mimeType,
    size: document.size,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    owner: document.owner ? mapUser(document.owner) : undefined,
    role,
    currentVersion: document._count?.versions,
    shareCount: document._count?.shares,
    ...(toDocumentStatus(document.status) ? { status: toDocumentStatus(document.status) } : {}),
    ...(typeof document.statusNote === 'string' ? { statusNote: document.statusNote } : {}),
    ...(isScanStatus(document.scanStatus) ? { scanStatus: document.scanStatus } : {}),
  };
}

function mapVersion(version: ApiVersion): DocumentVersion {
  return {
    id: version.id,
    documentId: version.documentId,
    version: version.versionNumber,
    sha256: version.hash,
    createdAt: version.createdAt,
    createdBy: version.createdBy
      ? mapUser(version.createdBy)
      : version.createdById || 'Pengguna',
    createdById: version.createdById,
    ...(typeof version.changeNote === 'string' ? { changeNote: version.changeNote } : {}),
    ...(isScanStatus(version.scanStatus) ? { scanStatus: version.scanStatus } : {}),
  };
}

function mapShare(share: ApiShare): DocumentShare {
  return {
    id: share.id,
    documentId: share.documentId,
    userId: share.userId,
    email: share.user.email,
    role: toRole(share.role) || 'viewer',
    sharedAt: share.createdAt,
    user: mapUser(share.user),
  };
}

function mapInvitation(invitation: ApiInvitation): DocumentInvitation {
  return {
    ...invitation,
    role: toRole(invitation.role) || 'viewer',
    status: invitation.status.toLowerCase() as InvitationStatus,
    invitedBy: invitation.invitedBy ? mapUser(invitation.invitedBy) : undefined,
  };
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.token === 'string' && isRecord(parsed.user)) {
      const { id, name, email } = parsed.user;
      if (typeof id === 'string' && typeof name === 'string' && typeof email === 'string') {
        const apiRole = typeof parsed.user.role === 'string'
          ? toRole(parsed.user.role)
          : undefined;
        const user: User = {
          id,
          name,
          email,
          ...(apiRole ? { role: apiRole } : {}),
          ...(typeof parsed.user.avatarUrl === 'string'
            ? { avatarUrl: parsed.user.avatarUrl }
            : {}),
          ...(typeof parsed.user.createdAt === 'string'
            ? { createdAt: parsed.user.createdAt }
            : {}),
        };
        return { token: parsed.token, user };
      }
    }
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSession(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(SESSION_KEY);
}

function saveSession(response: { token: string; user: ApiUser }): AuthSession {
  if (
    typeof response.token !== 'string' ||
    !response.token ||
    !isRecord(response.user) ||
    typeof response.user.id !== 'string' ||
    typeof response.user.name !== 'string' ||
    typeof response.user.email !== 'string'
  ) {
    throw new ApiError('Server mengirim data autentikasi yang tidak lengkap.', 502);
  }
  const session: AuthSession = { token: response.token, user: mapUser(response.user) };
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  return session;
}

function apiErrorFromBody(body: unknown, status: number): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    return new ApiError(
      typeof body.error.message === 'string' ? body.error.message : `Permintaan gagal (${status}).`,
      status,
      typeof body.error.code === 'string' ? body.error.code : undefined,
      body.error.details,
    );
  }
  if (isRecord(body) && typeof body.message === 'string') {
    return new ApiError(body.message, status);
  }
  return new ApiError(`Permintaan gagal (${status}).`, status);
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  const raw = await response.text();
  let error = new ApiError(`Permintaan gagal (${response.status}).`, response.status);
  if (raw) {
    try {
      error = apiErrorFromBody(JSON.parse(raw) as unknown, response.status);
    } catch (parseError) {
      if (parseError instanceof ApiError) throw parseError;
      error = new ApiError(raw, response.status);
    }
  }
  if (response.status === 401) {
    return new ApiError('Sesi Anda berakhir atau tidak valid. Silakan masuk kembali.', 401, error.code, error.details);
  }
  if (response.status === 403) {
    return new ApiError('Anda tidak memiliki izin untuk melakukan tindakan ini.', 403, error.code, error.details);
  }
  if (response.status === 404) {
    return new ApiError('Dokumen atau halaman yang diminta tidak ditemukan.', 404, error.code, error.details);
  }
  return error;
}

function unwrap<T>(body: unknown, status: number): T {
  if (isRecord(body) && body.success === true && 'data' in body) {
    return body.data as T;
  }
  if (isRecord(body) && body.success === false) {
    throw apiErrorFromBody(body, status);
  }
  throw new ApiError('Format respons server tidak sesuai kontrak API.', status);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const authToken = token || getSession()?.token;
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi Anda.', 0);
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  if (!raw.trim()) return undefined as T;
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError('Server mengirim respons yang tidak dapat dibaca.', response.status);
  }
  return unwrap<T>(body, response.status);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await request<{ token: string; user: ApiUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return saveSession(response);
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await request<{ token: string; user: ApiUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  return saveSession(response);
}

export async function getCurrentUser(): Promise<User> {
  const response = await request<{ user: ApiUser }>('/auth/me');
  const session = getSession();
  const user = mapUser(response.user);
  const currentUser = user.role || !session?.user.role ? user : { ...user, role: session.user.role };
  if (session) saveSession({ token: session.token, user: currentUser });
  return currentUser;
}

export async function updateCurrentUser(input: {
  name?: string;
  email?: string;
}): Promise<AuthSession> {
  const response = await request<{
    user: ApiUser;
    token?: string;
    accessToken?: string;
  }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  const currentSession = getSession();
  if (!currentSession) {
    throw new ApiError('Sesi Anda berakhir atau tidak valid. Silakan masuk kembali.', 401);
  }
  const user = mapUser(response.user);
  return saveSession({
    user: user.role || !currentSession.user.role ? user : { ...user, role: currentSession.user.role },
    token: response.accessToken || response.token || currentSession.token,
  });
}

export async function updatePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  await request<unknown>('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function listDocuments(): Promise<Document[]> {
  const response = await request<{ documents: ApiDocument[] }>('/documents');
  return response.documents.map(mapDocument);
}

export async function getDocument(id: string): Promise<Document> {
  const response = await request<{ document: ApiDocument }>(
    `/documents/${encodeURIComponent(id)}`,
  );
  return mapDocument(response.document);
}

export async function listDocumentVersions(id: string): Promise<DocumentVersion[]> {
  const response = await request<{ versions: ApiVersion[] }>(
    `/documents/${encodeURIComponent(id)}/versions`,
  );
  return response.versions.map(mapVersion);
}

export async function uploadDocument(
  file: File,
  title: string,
  documentId?: string,
): Promise<Document> {
  const form = new FormData();
  form.append('file', file);
  if (!documentId) {
    form.append('title', title.trim());
  }
  const path = documentId
    ? `/documents/${encodeURIComponent(documentId)}/versions`
    : '/documents';
  const response = await request<{
    document: ApiDocument;
    version?: ApiVersion;
  }>(path, { method: 'POST', body: form });
  return mapDocument(response.document);
}

export async function updateDocument(
  id: string,
  input: { title?: string; description?: string | null },
): Promise<Document> {
  const response = await request<{ document: ApiDocument }>(
    `/documents/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return mapDocument(response.document);
}

export async function updateDocumentStatus(
  id: string,
  input: { status: 'VERIFIED' | 'REJECTED'; statusNote?: string | null },
): Promise<Document> {
  const response = await request<{ document: ApiDocument }>(
    `/documents/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
  return mapDocument(response.document);
}

export async function downloadDocument(
  id: string,
): Promise<{ blob: Blob; fileName: string }> {
  const headers = new Headers();
  const token = getSession()?.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(id)}/download`, {
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Tidak dapat mengunduh dokumen. Periksa koneksi Anda.', 0);
  }
  if (!response.ok) throw await errorFromResponse(response);
  const disposition = response.headers.get('Content-Disposition') || '';
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  let fileName = quotedName || 'dokumen';
  if (encodedName) {
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      fileName = quotedName || 'dokumen';
    }
  }
  return { blob: await response.blob(), fileName };
}

export async function deleteDocument(id: string): Promise<void> {
  await request<{ deleted: boolean; cleanupPending: boolean }>(
    `/documents/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function shareDocument(
  id: string,
  email: string,
  role: DocumentRole,
): Promise<ShareResult> {
  const response = await request<
    | { type: 'SHARE'; created: boolean; share: ApiShare }
    | { type: 'INVITATION'; invitation: ApiInvitation }
  >(`/documents/${encodeURIComponent(id)}/shares`, {
    method: 'POST',
    body: JSON.stringify({ email, role: fromRole(role) }),
  });
  return response.type === 'SHARE'
    ? { ...response, share: mapShare(response.share) }
    : { ...response, invitation: mapInvitation(response.invitation) };
}

export async function listDocumentShares(id: string): Promise<DocumentShare[]> {
  const response = await request<{ shares: ApiShare[] }>(
    `/documents/${encodeURIComponent(id)}/shares`,
  );
  return response.shares.map(mapShare);
}

export async function updateDocumentShare(
  id: string,
  shareId: string,
  role: DocumentRole,
): Promise<DocumentShare> {
  const response = await request<{ share: ApiShare }>(
    `/documents/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`,
    { method: 'PATCH', body: JSON.stringify({ role: fromRole(role) }) },
  );
  return mapShare(response.share);
}

export async function removeDocumentShare(id: string, shareId: string): Promise<void> {
  await request<{ revoked: boolean }>(
    `/documents/${encodeURIComponent(id)}/shares/${encodeURIComponent(shareId)}`,
    { method: 'DELETE' },
  );
}

export async function listDocumentInvitations(id: string): Promise<DocumentInvitation[]> {
  const response = await request<{ invitations: ApiInvitation[] }>(
    `/documents/${encodeURIComponent(id)}/invitations`,
  );
  return response.invitations.map(mapInvitation);
}

export async function revokeDocumentInvitation(id: string, invitationId: string): Promise<void> {
  await request<{ revoked: boolean }>(
    `/documents/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE' },
  );
}

export async function acceptInvitation(token: string): Promise<{
  accepted: boolean;
  role: DocumentRole;
}> {
  const response = await request<{ accepted: boolean; role: ApiRole }>(
    '/invitations/accept',
    { method: 'POST', body: JSON.stringify({ token }) },
  );
  return { accepted: response.accepted, role: toRole(response.role) || 'viewer' };
}

export async function verifyDocumentHash(
  id: string,
): Promise<HashVerificationResult> {
  return request<HashVerificationResult>(
    `/documents/${encodeURIComponent(id)}/verify`,
  );
}

export async function getAuditTrail(
  id: string,
  page = 1,
  pageSize = 25,
): Promise<AuditTrailItem[]> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const response = await request<{ entries: ApiAuditEntry[] }>(
    `/documents/${encodeURIComponent(id)}/audit?${query.toString()}`,
  );
  return response.entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actor: entry.actor ? mapUser(entry.actor) : null,
    timestamp: entry.createdAt,
    details:
      entry.details == null
        ? undefined
        : typeof entry.details === 'string'
          ? entry.details
          : JSON.stringify(entry.details),
    ipAddress: entry.ipAddress || undefined,
  }));
}

export async function createEventStreamToken(documentId: string): Promise<string> {
  const response = await request<{ token: string }>(
    `/documents/${encodeURIComponent(documentId)}/events/token`,
    { method: 'POST' },
  );
  return response.token;
}

export async function publishDocumentActivity(
  documentId: string,
  action: 'active' | 'editing',
): Promise<void> {
  await request<{ published: boolean }>(
    `/documents/${encodeURIComponent(documentId)}/events`,
    { method: 'POST', body: JSON.stringify({ action }) },
  );
}
