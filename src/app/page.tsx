'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DOCUMENT_CONTEXT } from '@/lib/labels';

type NewsCategory = 'Berita' | 'Panduan' | 'Keamanan';

const newsCategories: NewsCategory[] = ['Berita', 'Panduan', 'Keamanan'];

const articles: Array<{
  category: NewsCategory;
  title: string;
  description: string;
  date: string;
  url: string;
}> = [
  {
    category: 'Berita',
    title: 'CNN Indonesia — Jokowi Usai Hadiri Sidang Ijazah Palsu: Hanya Minta Keadilan',
    description: 'Laporan persidangan kasus tudingan ijazah palsu di PN Jakarta Timur ketika Jokowi hadir sebagai saksi dan menunjukkan dokumen ijazah SD hingga S1 di hadapan majelis hakim dan para pihak.',
    date: '5 Nov 2026',
    url: 'https://www.cnnindonesia.com/nasional/20261105234517-12-1423934/jokowi-usai-hadiri-sidang-ijazah-palsu-hanya-minta-keadilan',
  },
  {
    category: 'Berita',
    title: 'Kompas.com — Akhir Gugatan Dokumen Pendidikan Gibran, Suket Dicabut, Perkara di PTUN Gugur',
    description: 'Pemberitaan mengenai perkara sengketa surat keterangan penyetaraan ijazah SMA Gibran Rakabuming Raka di PTUN Jakarta yang dinyatakan gugur setelah objek sengketa dicabut.',
    date: '13 Nov 2026',
    url: 'https://nasional.kompas.com/read/2026/11/13/10202211/akhir-gugatan-dokumen-pendidikan-gibran-suket-dicabut-perkara-di-ptun-gugur',
  },
  {
    category: 'Berita',
    title: 'Kompas.com — Muncul Petisi Desakan Buka dan Verifikasi Ijazah Seluruh Anggota DPR',
    description: 'Sorotan publik dan petisi transparansi yang mendorong pembukaan serta verifikasi dokumen ijazah anggota DPR RI.',
    date: '17 Nov 2026',
    url: 'https://nasional.kompas.com/read/2026/11/17/10171991/muncul-petisi-desakan-buka-dan-verifikasi-ijazah-seluruh-anggota-dpr',
  },
  {
    category: 'Panduan',
    title: 'LLDIKTI Wilayah XIII — Cek Ijazah Kuliah secara Online: Cara Verifikasi Resmi Lewat PISN dan SatuDikti',
    description: 'Panduan langkah demi langkah pengecekan nomor ijazah/NIM lewat PISN dan aplikasi SatuDikti (menu SIVIL), termasuk catatan bahwa data yang belum tampil bisa disebabkan pelaporan kampus ke PDDikti yang belum masuk atau belum memenuhi syarat generate.',
    date: '30 Okt 2025',
    url: 'https://lldikti13.kemdiktisaintek.go.id/2025/10/30/cek-ijazah-kuliah-secara-online-cara-verifikasi-resmi-lewat-pisn-dan-satudikti-update-2025/',
  },
  {
    category: 'Panduan',
    title: 'Telkom University (PDDikti Hub) — Panduan Lengkap: Cara Cek dan Verifikasi Nomor Ijazah / PISN secara Online',
    description: 'Alur praktis memilih perguruan tinggi, jenjang, program studi, tipe pencarian (NIM atau nomor ijazah), serta kode CAPTCHA pada portal resmi PISN.',
    date: 'Panduan PISN',
    url: 'https://pddikti-hub.telkomuniversity.ac.id/panduan-lengkap-cara-cek-dan-verifikasi-nomor-ijazah-pisn-secara-online/',
  },
  {
    category: 'Keamanan',
    title: 'Jurnal Komprehensif — Implementasi Tanda Tangan Digital Menggunakan RSA-PSS dan SHA-256 untuk Keamanan Dokumen Elektronik',
    description: 'Membahas kombinasi hash SHA-256, tanda tangan digital RSA-PSS, dan QR Code berbasis referensi untuk memeriksa integritas dokumen PDF serta memverifikasi tanda tangan berdasarkan kunci publik penandatangan.',
    date: 'Jurnal Keamanan',
    url: 'https://ejournal.edutechjaya.com/index.php/komprehensif/article/view/2221',
  },
  {
    category: 'Keamanan',
    title: 'Jurnal UNISTEK — Sistem Tanda Tangan Digital Menggunakan SHA-3 dan ECDSA',
    description: 'Mengulas pemanfaatan fungsi hash dan kriptografi tanda tangan digital untuk mendeteksi perubahan isi dokumen sekaligus menjaga otentikasi dan validasi keaslian dokumen elektronik.',
    date: 'Jurnal Keamanan',
    url: 'https://ejournal.unis.ac.id/index.php/UNISTEK/article/download/3538/2079',
  },
];

function BackgroundAsset({
  asset,
  className,
}: {
  asset: 'c1' | 'c3';
  className: string;
}) {
  return (
    <img
      src={`/${asset}.png`}
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}

export default function HomePage() {
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory>('Berita');
  const visibleArticles = articles.filter((article) => article.category === selectedCategory);

  return (
    <main className="min-h-screen overflow-hidden bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <Link href="/" className="flex shrink-0 items-center gap-3 font-bold tracking-tight">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm">
              <img src="/xecureit.png" alt="XecureIT" className="h-full w-full object-contain" />
            </span>
            <span className="text-lg">XecureIT</span>
          </Link>
          <nav aria-label="Navigasi utama" className="flex w-full items-center justify-between gap-1 sm:w-auto sm:gap-3">
            <a href="#berita" className="rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:text-blue-700 sm:px-3 sm:text-sm">
              Berita
            </a>
            <Link href="/login" className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 hover:text-blue-700 sm:px-3 sm:text-sm">
              Masuk
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate">
        <BackgroundAsset asset="c1" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50/80 via-white/75 to-cyan-50/80" />
        <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:pb-24 lg:pt-20">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/85 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ruang kerja dokumen yang lebih aman
            </div>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {DOCUMENT_CONTEXT.homeTitle}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              {DOCUMENT_CONTEXT.homeDescription}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login?mode=register" className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                Buat ruang kerja <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Atur akses kolaborator dan tinjau integritas dokumen dari satu tempat.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div aria-hidden="true" className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-blue-100 to-cyan-100 blur-2xl" />
            <article className="relative rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-300/50 sm:p-7">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.15em] text-slate-400">Ruang kerja dokumen</p>
                  <h2 className="mt-1 text-xl font-bold">Ijazah &amp; Sertifikat</h2>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Contoh tampilan</span>
              </div>
              <div className="mt-5 space-y-3">
                {DOCUMENT_CONTEXT.previewFiles.slice(0, 3).map((name, index) => (
                  <div key={name} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[10px] font-bold ${
                      ['bg-rose-50 text-rose-600', 'bg-blue-50 text-blue-600', 'bg-emerald-50 text-emerald-600'][index]
                    }`}>
                      PDF
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
                      <p className="mt-1 text-xs text-slate-400">Ilustrasi dokumen, bukan data akun</p>
                    </div>
                    <span aria-hidden="true" className="text-slate-300">•••</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-blue-50/80 px-4 py-3.5">
                <p className="text-sm font-semibold text-blue-900">Pemeriksaan integritas</p>
                <p className="mt-1 text-xs leading-5 text-blue-800">
                  Verifikasi hash tersedia di detail dokumen.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="berita" className="relative isolate min-h-[72rem] scroll-mt-20 bg-white pt-16 pb-8 md:min-h-[60rem] sm:pt-20 sm:pb-10 lg:min-h-[44rem]">
        <BackgroundAsset
          asset="c3"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-35"
        />
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">Kabar &amp; pengetahuan</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Berita &amp; insight terbaru</h2>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Tautan berikut merupakan referensi eksternal terkurasi. Judul, tanggal, dan ringkasan merujuk pada sumber masing-masing.
          </p>

          <div role="group" aria-label="Filter kategori artikel" className="mt-7 flex flex-wrap gap-2">
            {newsCategories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={selectedCategory === category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  selectedCategory === category
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white/90 text-slate-600 hover:border-blue-200 hover:text-blue-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleArticles.map((article) => (
              <article key={article.title} className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40">
                <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                  {article.category}
                </span>
                <h3 className="mt-4 break-words text-lg font-bold leading-snug">{article.title}</h3>
                <p className="mt-2 break-words text-sm leading-6 text-slate-600">{article.description}</p>
                <div className="mt-auto pt-5">
                  <p className="text-xs text-slate-500">{article.date}</p>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-semibold text-blue-700 hover:text-blue-900"
                  >
                    Baca sumber <span aria-hidden="true">→</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
          {visibleArticles.length === 0 && (
            <p className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Belum ada artikel pada kategori ini.
            </p>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-5 py-7 text-slate-600 sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/" className="flex items-center gap-3 font-bold text-slate-900">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-slate-100 bg-white p-1.5">
                <img src="/xecureit.png" alt="XecureIT" className="h-full w-full object-contain" />
              </span>
              <span>XecureIT</span>
            </Link>
            <span className="text-xs text-slate-500">© 2026 XecureIT</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
