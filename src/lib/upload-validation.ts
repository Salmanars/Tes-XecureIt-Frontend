export const MAX_DOCUMENT_UPLOAD_SIZE = 10 * 1024 * 1024;
const allowedTypes: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv'],
};

export function validateDocumentUploadFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const acceptedMimeTypes = allowedTypes[extension];
  if (!acceptedMimeTypes) {
    return 'Format file tidak didukung. Pilih PDF, DOCX, TXT, atau CSV.';
  }
  if (!acceptedMimeTypes.includes(file.type.toLowerCase())) {
    return 'Tipe file tidak sesuai dengan ekstensi. Pilih file yang valid.';
  }
  if (file.size > MAX_DOCUMENT_UPLOAD_SIZE) {
    return 'Ukuran file melebihi batas maksimal 10 MB.';
  }
  return null;
}
