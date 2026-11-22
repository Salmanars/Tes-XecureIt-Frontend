'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { uploadDocument } from '@/lib/api';
import { DOCUMENT_CONTEXT } from '@/lib/labels';
import { validateDocumentUploadFile } from '@/lib/upload-validation';
import type { Document } from '@/types/document';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (document: Document) => void;
  documentId?: string;
  initialFile?: File | null;
}

export function UploadDocumentModal({
  isOpen,
  onClose,
  onUploaded,
  documentId,
  initialFile,
}: UploadDocumentModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && initialFile) chooseFile(initialFile);
  }, [initialFile, isOpen]);

  if (!isOpen) return null;

  function chooseFile(candidate: File | undefined) {
    setError('');
    if (!candidate) {
      setFile(null);
      return;
    }
    const validationError = validateDocumentUploadFile(candidate);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setFile(candidate);
    if (!documentId) {
      setTitle((current) => current || candidate.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Pilih file yang akan diunggah terlebih dahulu.');
      return;
    }
    if (!documentId && !title.trim()) {
      setError('Masukkan nama dokumen.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const document = await uploadDocument(file, title, documentId);
      onUploaded(document);
      setFile(null);
      setTitle('');
      setChangeNote('');
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Dokumen gagal diunggah.');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    if (loading) return;
    setError('');
    setFile(null);
    setTitle('');
    setChangeNote('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="upload-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">{documentId ? 'Pembaruan dokumen' : 'Ijazah & sertifikat'}</p>
            <h2 id="upload-title" className="mt-1 text-xl font-bold text-ink">{documentId ? 'Unggah versi baru' : DOCUMENT_CONTEXT.uploadTitle}</h2>
          </div>
          <button type="button" aria-label="Tutup" onClick={close} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <form onSubmit={submit} className="mt-6">
          {!documentId && (
            <label className="mb-4 block text-sm font-semibold text-slate-700">
              Nama dokumen
              <input
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={DOCUMENT_CONTEXT.uploadTitlePlaceholder}
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"
              />
            </label>
          )}
          {documentId && (
            <label className="mb-4 block text-sm font-semibold text-slate-700">
              Catatan Perubahan
              <textarea
                maxLength={500}
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                rows={3}
                placeholder="Jelaskan perubahan pada versi ini (opsional)"
                className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"
              />
              <span className="mt-1 block text-right text-xs font-normal text-slate-400">{changeNote.length}/500</span>
              <span className="mt-1 block text-xs font-normal text-amber-700">Endpoint versi saat ini belum menyimpan catatan perubahan; catatan ini hanya untuk membantu proses unggah.</span>
            </label>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/csv"
            className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-9 text-center hover:border-blue-300 hover:bg-blue-50/40">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-xl text-blue-700">↑</span>
            <span className="mt-4 block text-sm font-semibold text-slate-800">{file ? file.name : 'Pilih file atau klik untuk menelusuri'}</span>
            <span className="mt-1 block text-xs text-slate-500">PDF, DOCX, TXT, atau CSV · Maksimal 10 MB</span>
          </button>
          {file && <p className="mt-3 text-xs text-slate-500">Ukuran: {(file.size / (1024 * 1024)).toFixed(2)} MB</p>}
          <p className="mt-3 text-xs leading-5 text-slate-400">
            File divalidasi oleh server saat diunggah. Status pemindaian historis per versi belum disediakan API.
          </p>
          {loading && (
            <div role="status" className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <p>File sedang dikirim ke server untuk validasi.</p>
              <progress aria-label="Progres unggah" className="mt-2 h-1.5 w-full accent-blue-600" />
            </div>
          )}
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="mt-7 flex justify-end gap-3">
            <button type="button" onClick={close} disabled={loading} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Batal</button>
            <button type="submit" disabled={!file || loading} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? 'Mengunggah…' : documentId ? 'Unggah versi' : 'Unggah dokumen'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
