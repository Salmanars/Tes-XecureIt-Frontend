import type { DocumentRole } from '@/types/document';

export type DocumentStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REVOKED';

export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED';
export type DocumentRoleCode = 'OWNER' | 'EDITOR' | 'VIEWER';
export type HashStatusCode = 'VALID' | 'MISMATCH' | 'FILE_MISSING';
export type PublicVerificationOutcome = 'ORIGINAL' | 'MODIFIED' | 'REVOKED' | 'NOT_FOUND';

export const ROLE_LABELS: Record<DocumentRoleCode, string> = {
  OWNER: 'Admin XecureIT / Pengelola Utama',
  EDITOR: 'Penerbit / Instansi — Kampus/Lembaga',
  VIEWER: 'Penerima / Mahasiswa',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING_VERIFICATION: 'Menunggu Verifikasi',
  VERIFIED: 'Terverifikasi',
  REJECTED: 'Perlu Revisi',
  REVOKED: 'Dicabut',
};

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  PENDING: 'Menunggu pemindaian',
  CLEAN: 'Aman',
  INFECTED: 'Terinfeksi',
};

export const HASH_STATUS_LABELS: Record<HashStatusCode, string> = {
  VALID: 'Terverifikasi',
  MISMATCH: 'Hash tidak cocok',
  FILE_MISSING: 'File tidak ditemukan',
};

export const PUBLIC_VERIFICATION_OUTCOME_LABELS: Record<PublicVerificationOutcome, string> = {
  ORIGINAL: 'Asli',
  MODIFIED: 'Dimodifikasi',
  REVOKED: 'Dicabut',
  NOT_FOUND: 'Tidak Ditemukan',
};

export const INVITATION_STATUS_LABELS: Record<
  'pending' | 'accepted' | 'revoked' | 'expired',
  string
> = {
  pending: 'Menunggu',
  accepted: 'Diterima',
  revoked: 'Dicabut',
  expired: 'Kedaluwarsa',
};

export const DOCUMENT_CONTEXT = {
  homeTitle: 'Ijazah dan sertifikat penting, selalu dalam kendali Anda.',
  homeDescription: 'Kelola akses, riwayat versi, dan integritas ijazah atau sertifikat dalam satu ruang kerja.',
  dashboardEyebrow: 'Verifikasi dokumen resmi',
  dashboardDescription: 'Kelola ijazah, sertifikat, dan dokumen resmi dengan kontrol akses serta pemeriksaan integritas.',
  searchPlaceholder: 'Cari nama ijazah, sertifikat, atau file…',
  uploadTitle: 'Unggah ijazah atau sertifikat',
  uploadTitlePlaceholder: 'Contoh: Ijazah Sarjana Informatika',
  emptyTitle: 'Belum ada ijazah atau sertifikat',
  emptyDescription: 'Unggah dokumen resmi untuk mulai mengelola akses dan integritasnya.',
  previewDisclosure: 'Pratinjau contoh — bukan data dokumen atau aktivitas nyata',
  previewTitle: 'Ijazah & Sertifikat',
  previewFiles: [
    'Ijazah Sarjana Informatika.pdf',
    'Sertifikat Kompetensi Digital.pdf',
    'Sertifikat Pelatihan Keamanan.pdf',
  ],
  publicVerifyTitle: 'Verifikasi ijazah dan sertifikat',
  publicVerifyDescription: 'Periksa status dokumen resmi menggunakan kode dokumen atau file.',
} as const;

export function roleLabel(role: DocumentRole): string {
  switch (role) {
    case 'owner':
      return ROLE_LABELS.OWNER;
    case 'editor':
      return ROLE_LABELS.EDITOR;
    case 'viewer':
      return ROLE_LABELS.VIEWER;
  }
}

export function documentStatusLabel(status?: DocumentStatus): string {
  return status ? DOCUMENT_STATUS_LABELS[status] : 'Status belum tersedia';
}

export function documentStatusClass(status?: DocumentStatus): string {
  switch (status) {
    case 'PENDING_VERIFICATION':
      return 'bg-amber-50 text-amber-800';
    case 'VERIFIED':
      return 'bg-emerald-50 text-emerald-700';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700';
    case 'REVOKED':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export function scanStatusLabel(status?: ScanStatus): string {
  return status ? SCAN_STATUS_LABELS[status] : 'Belum dilaporkan oleh server';
}

export function scanStatusClass(status?: ScanStatus): string {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-50 text-amber-800';
    case 'CLEAN':
      return 'bg-emerald-50 text-emerald-700';
    case 'INFECTED':
      return 'bg-rose-50 text-rose-700';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return value === 'PENDING_VERIFICATION' ||
    value === 'VERIFIED' ||
    value === 'REJECTED' ||
    value === 'REVOKED';
}

export function isScanStatus(value: unknown): value is ScanStatus {
  return value === 'PENDING' || value === 'CLEAN' || value === 'INFECTED';
}
