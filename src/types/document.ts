import type { DocumentStatus, ScanStatus } from '@/lib/labels';

export type DocumentRole = 'owner' | 'editor' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: DocumentRole;
  avatarUrl?: string;
  createdAt?: string;
}

export interface DocumentVersion {
  id: string;
  documentId?: string;
  version: number;
  fileName?: string;
  size?: number;
  sha256: string;
  createdAt: string;
  createdBy: User | string;
  createdById?: string;
  changeNote?: string | null;
  scanStatus?: ScanStatus;
}

export interface DocumentShare {
  id: string;
  documentId: string;
  userId: string;
  email: string;
  role: DocumentRole;
  sharedAt: string;
  user?: User;
}

export interface DocumentInvitation {
  id: string;
  documentId: string;
  email: string;
  role: DocumentRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy?: User;
}

export interface Document {
  id: string;
  name: string;
  description?: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  sha256?: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  owner?: User;
  currentVersion?: number;
  versions?: DocumentVersion[];
  shares?: DocumentShare[];
  shareCount?: number;
  role?: DocumentRole;
  status?: DocumentStatus;
  statusNote?: string | null;
  scanStatus?: ScanStatus;
}

export interface HashVerificationResult {
  valid: boolean;
  matches: boolean;
  status: 'VALID' | 'MISMATCH' | 'FILE_MISSING';
  expectedHash: string;
  actualHash: string | null;
  verifiedAt: string;
  message: string;
  version: {
    id: string;
    number: number;
    createdAt: string;
  };
}

export interface AuditTrailItem {
  id: string;
  action: string;
  actor: User | string | null;
  timestamp: string;
  details?: string;
  ipAddress?: string;
}

export interface ActiveCollaborator {
  id: string;
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role?: DocumentRole;
  isEditing: boolean;
  lastActiveAt?: string;
}
