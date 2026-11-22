'use client';

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/api';
import { connectDocumentPresence } from '@/lib/realtime';
import type { ActiveCollaborator } from '@/types/document';

interface CollaborationIndicatorProps {
  documentId: string;
}

export function CollaborationIndicator({ documentId }: CollaborationIndicatorProps) {
  const [collaborators, setCollaborators] = useState<ActiveCollaborator[]>([]);
  const [connectionError, setConnectionError] = useState('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'unavailable'>('connecting');

  useEffect(() => {
    const currentUserId = getSession()?.user.id;
    setConnectionState('connecting');
    setConnectionError('');
    return connectDocumentPresence(documentId, {
      onCollaborators: (active) => {
        setCollaborators(active.filter((person) => person.userId !== currentUserId));
        setConnectionError('');
        setConnectionState('connected');
      },
      onError: (error) => {
        setConnectionError(error.message);
        setConnectionState('unavailable');
      },
    });
  }, [documentId]);

  const statusText = connectionState === 'unavailable'
    ? 'Status kehadiran tidak tersedia'
    : connectionState === 'connecting'
      ? 'Menghubungkan indikator kehadiran…'
      : collaborators.length
        ? `${collaborators.length} pengguna aktif`
        : 'Belum ada kolaborator lain yang terdeteksi';

  return (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className={`h-2 w-2 rounded-full ${
        connectionState === 'connected' ? 'bg-emerald-500' : connectionState === 'unavailable' ? 'bg-amber-400' : 'bg-slate-300'
      }`} />
      <span className="text-sm font-medium text-slate-700">{statusText}</span>
      {connectionError && <span className="text-xs text-slate-500">{connectionError}</span>}
      {connectionState === 'connected' && collaborators.length > 0 && (
        <div className="flex items-center gap-2">
          {collaborators.slice(0, 4).map((person) => (
            <span key={person.userId} title={`${person.name}${person.isEditing ? ' — sedang mengedit' : ''}`} className="relative grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : person.name.slice(0, 1).toUpperCase()}
              {person.isEditing && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" />}
            </span>
          ))}
          <span className="text-xs text-slate-500">
            {collaborators.filter((person) => person.isEditing).length} sedang mengedit
          </span>
        </div>
      )}
    </div>
  );
}
