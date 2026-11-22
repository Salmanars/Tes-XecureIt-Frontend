import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'XecureIT — Berbagi dokumen dengan aman',
  description:
    'Simpan, bagikan, dan verifikasi dokumen dengan kontrol akses dan jejak audit.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
