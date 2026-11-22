import { createEventStreamToken, SSE_BASE_URL } from '@/lib/api';
import type { ActiveCollaborator } from '@/types/document';

export interface PresenceHandlers {
  onCollaborators: (collaborators: ActiveCollaborator[]) => void;
  onError?: (error: Error) => void;
}

interface CollaborationEvent {
  type: 'presence' | 'activity' | 'access';
  action: string;
  user: { id: string; name: string };
  occurredAt: string;
}

function isCollaborationEvent(value: unknown): value is CollaborationEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.user !== 'object' || event.user === null) return false;
  const user = event.user as Record<string, unknown>;
  return (
    (event.type === 'presence' || event.type === 'activity' || event.type === 'access') &&
    typeof event.action === 'string' &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof event.occurredAt === 'string'
  );
}

export function connectDocumentPresence(
  documentId: string,
  handlers: PresenceHandlers,
): () => void {
  const controller = new AbortController();
  let activeCollaborators: ActiveCollaborator[] = [];

  const readEvents = async (): Promise<void> => {
    try {
      const eventToken = await createEventStreamToken(documentId);
      const eventsUrl = new URL(
        `${SSE_BASE_URL}/${encodeURIComponent(documentId)}/events`,
      );
      eventsUrl.searchParams.set('token', eventToken);
      const response = await fetch(eventsUrl, {
        headers: { Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        const message =
          response.status === 401 || response.status === 403
            ? 'Akses kolaborasi berakhir atau tidak diizinkan.'
            : `Koneksi kolaborasi gagal (${response.status}).`;
        throw new Error(message);
      }
      if (!response.body) {
        throw new Error('Server tidak mendukung aliran kolaborasi.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data) continue;

          let event: unknown;
          try {
            event = JSON.parse(data) as unknown;
          } catch {
            handlers.onError?.(new Error('Data status kolaborasi tidak valid.'));
            continue;
          }
          if (!isCollaborationEvent(event)) {
            handlers.onError?.(new Error('Format event kolaborasi tidak dikenali.'));
            continue;
          }
          if (event.type === 'access' && event.action === 'revoked') {
            handlers.onError?.(new Error('Akses kolaborasi untuk dokumen ini telah dicabut.'));
            controller.abort();
            break;
          }
          if (event.action === 'document.deleted') {
            handlers.onError?.(new Error('Dokumen telah dihapus.'));
            controller.abort();
            break;
          }

          if (event.action === 'left') {
            activeCollaborators = activeCollaborators.filter(
              (person) => person.userId !== event.user.id,
            );
          } else if (['opened', 'active', 'editing'].includes(event.action)) {
            const collaborator: ActiveCollaborator = {
              id: event.user.id,
              userId: event.user.id,
              name: event.user.name || 'Pengguna',
              isEditing: event.action === 'editing',
              lastActiveAt: event.occurredAt,
            };
            activeCollaborators = [
              ...activeCollaborators.filter((person) => person.userId !== collaborator.userId),
              collaborator,
            ];
          } else {
            continue;
          }
          handlers.onCollaborators(activeCollaborators);
        }
      }
      if (!controller.signal.aborted) {
        handlers.onError?.(new Error('Koneksi kolaborasi terputus.'));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      handlers.onError?.(
        error instanceof Error ? error : new Error('Koneksi kolaborasi gagal.'),
      );
    }
  };

  void readEvents();
  return () => controller.abort();
}
