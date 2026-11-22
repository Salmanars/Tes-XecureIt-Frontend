'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { login, register } from '@/lib/api';

const WELCOME_NOTICE_KEY = 'xecureit-welcome-once';

function postAuthPath(): string {
  const requestedPath = new URLSearchParams(window.location.search).get('next');
  if (!requestedPath) return '/dashboard';
  try {
    const destination = new URL(requestedPath, window.location.origin);
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mode') === 'register') {
      setIsRegister(true);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const session = isRegister
        ? await register(name.trim(), email.trim(), password)
        : await login(email.trim(), password);
      window.sessionStorage.setItem(WELCOME_NOTICE_KEY, session.user.name || '');
      router.replace(postAuthPath());
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Autentikasi gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  function switchAuthMode() {
    setError('');
    setIsRegister((current) => {
      const next = !current;
      const params = new URLSearchParams(window.location.search);
      if (next) params.set('mode', 'register');
      else params.delete('mode');
      const query = params.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
      return next;
    });
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_.85fr]">
      <section className="relative isolate hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img
          src="/Office XecureIT.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 z-[1] bg-gradient-to-br from-slate-950/80 via-blue-950/60 to-slate-950/75" />
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3 font-bold tracking-tight">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white p-1.5 shadow-sm">
              <img src="/xecureit.png" alt="XecureIT" className="h-full w-full object-contain" />
            </span>
            <span>
              <span className="block text-lg">XecureIT</span>
              <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-blue-100/70">Secure Doc &amp; Hash</span>
            </span>
          </Link>
          <p className="mt-6 max-w-lg text-base leading-7 text-blue-50">
            Atur izin akses, periksa integritas melalui verifikasi hash, dan telusuri aktivitas dokumen lewat audit trail.
          </p>
        </div>
        <p className="relative z-10 text-xs text-blue-100/70">XecureIT · Secure Document Sharing &amp; Verification</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 inline-flex items-center gap-3 font-bold tracking-tight text-ink lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm">
              <img src="/xecureit.png" alt="XecureIT" className="h-full w-full object-contain" />
            </span>
            <span>
              <span className="block">XecureIT</span>
              <span className="mt-0.5 block text-[10px] font-medium tracking-wide text-slate-400">Secure Doc &amp; Hash</span>
            </span>
          </Link>
          <p className="text-sm font-semibold text-blue-600">{isRegister ? 'Buat akun XecureIT' : 'Selamat datang kembali'}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{isRegister ? 'Daftar ke XecureIT' : 'Masuk ke XecureIT'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isRegister
              ? 'Buat akun untuk mengelola dan membagikan dokumen dengan aman.'
              : 'Masuk untuk mengelola dokumen, izin akses, dan verifikasi Anda.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {isRegister && (
              <label className="block text-sm font-semibold text-slate-700">
                Nama lengkap
                <input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama Anda" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-blue-500" />
              </label>
            )}
            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-blue-500" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Kata sandi
              <span className="relative mt-2 block">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  minLength={isRegister ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isRegister ? 'Minimal 8 karakter' : 'Masukkan kata sandi'}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 font-normal outline-none transition focus:border-blue-500"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-slate-700 focus-visible:text-blue-700"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7">
                    <path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.5" />
                    {showPassword && <path d="m4 4 16 16" />}
                  </svg>
                </button>
              </span>
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
              {loading ? 'Mohon tunggu…' : isRegister ? 'Buat akun' : 'Masuk'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}{' '}
            <button type="button" onClick={switchAuthMode} className="font-semibold text-blue-600 hover:text-blue-700">
              {isRegister ? 'Masuk' : 'Daftar'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
