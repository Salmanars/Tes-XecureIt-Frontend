'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Navbar } from '@/components/Navbar';
import { ApiError, getCurrentUser, getSession, listDocuments, updateCurrentUser, updatePassword } from '@/lib/api';
import { roleLabel } from '@/lib/labels';
import type { Document, DocumentRole, User } from '@/types/document';

type SettingsTab = 'profile' | 'password';
type Feedback = { type: 'error' | 'info' | 'success'; message: string };

function documentRole(document: Document, userId: string): DocumentRole {
  return document.role || (document.ownerId === userId ? 'owner' : 'viewer');
}

function detectWorkspaceRole(documents: Document[], userId: string): DocumentRole | null {
  if (documents.some((document) => documentRole(document, userId) === 'owner')) return 'owner';
  if (documents.some((document) => documentRole(document, userId) === 'editor')) return 'editor';
  if (documents.length > 0) return 'viewer';
  return null;
}

function roleTitle(role: DocumentRole | null): string {
  if (!role) return 'Belum terdeteksi';
  return roleLabel(role);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function profileErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_ALREADY_IN_USE') {
      return 'Email tersebut sudah digunakan oleh akun lain. Gunakan alamat email yang berbeda.';
    }
    if (error.status === 400 || error.status === 422) {
      return `Data profil tidak valid. Periksa kembali nama dan email Anda. ${error.message}`;
    }
    if (error.status === 409) {
      return `Perubahan profil mengalami konflik. ${error.message}`;
    }
  }
  return error instanceof Error
    ? `Profil gagal diperbarui. ${error.message}`
    : 'Profil gagal diperbarui karena terjadi kesalahan yang tidak diketahui.';
}

function passwordErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === 'INVALID_CURRENT_PASSWORD' ||
      error.code === 'CURRENT_PASSWORD_INVALID' ||
      error.code === 'INVALID_OLD_PASSWORD'
    ) {
      return 'Password lama tidak sesuai. Periksa kembali password lama Anda.';
    }
    if (error.status === 400 || error.status === 422) {
      return `Server menolak perubahan password. ${error.message}`;
    }
  }
  return error instanceof Error
    ? `Password gagal diubah. ${error.message}`
    : 'Password gagal diubah karena terjadi kesalahan yang tidak diketahui.';
}

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  const styles = feedback.type === 'error'
    ? 'border-rose-100 bg-rose-50 text-rose-700'
    : feedback.type === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
      : 'border-amber-100 bg-amber-50 text-amber-800';

  return (
    <p role={feedback.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {feedback.message}
    </p>
  );
}

function PasswordField({
  id,
  label,
  value,
  visible,
  onChange,
  onToggle,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: 'current-password' | 'new-password';
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="relative mt-2 block">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-20 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
        />
        <button
          type="button"
          aria-label={`${visible ? 'Sembunyikan' : 'Tampilkan'} ${label.toLocaleLowerCase()}`}
          aria-pressed={visible}
          onClick={onToggle}
          className="absolute inset-y-0 right-3 text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          {visible ? 'Sembunyikan' : 'Tampilkan'}
        </button>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [workspaceRole, setWorkspaceRole] = useState<DocumentRole | null>(null);
  const [workspaceRoleLoading, setWorkspaceRoleLoading] = useState(true);
  const [workspaceRoleError, setWorkspaceRoleError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  useEffect(() => {
    let cancelled = false;
    const session = getSession();

    if (!session) {
      router.replace('/login');
      return () => {
        cancelled = true;
      };
    }

    setUser(session.user);
    setProfileName(session.user.name);
    setProfileEmail(session.user.email);
    setWorkspaceRole(session.user.role || null);

    void getCurrentUser()
      .then((currentUser) => {
        if (!cancelled && currentUser.role) setWorkspaceRole(currentUser.role);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setWorkspaceRoleError(
            loadError instanceof Error
              ? `Role akun tidak dapat disegarkan dari API: ${loadError.message}`
              : 'Role akun tidak dapat disegarkan dari API.',
          );
        }
      });

    void listDocuments()
      .then((documents) => {
        if (!cancelled) {
          setWorkspaceRole(session.user.role || detectWorkspaceRole(documents, session.user.id));
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setWorkspaceRoleError(
          loadError instanceof Error
            ? `Peran ruang kerja tidak dapat dimuat: ${loadError.message}`
            : 'Peran ruang kerja tidak dapat dimuat.',
        );
      })
      .finally(() => {
        if (!cancelled) setWorkspaceRoleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setProfileFeedback({ type: 'error', message: 'Sesi pengguna tidak tersedia. Silakan masuk kembali.' });
      return;
    }
    const name = profileName.trim();
    const email = profileEmail.trim();

    if (!name) {
      setProfileFeedback({ type: 'error', message: 'Nama lengkap wajib diisi.' });
      return;
    }
    if (!isValidEmail(email)) {
      setProfileFeedback({ type: 'error', message: 'Masukkan alamat email yang valid.' });
      return;
    }
    const changes: { name?: string; email?: string } = {};
    if (name !== user.name) changes.name = name;
    if (email !== user.email) changes.email = email;
    if (Object.keys(changes).length === 0) {
      setProfileFeedback({ type: 'info', message: 'Tidak ada perubahan profil untuk disimpan.' });
      return;
    }

    setProfileSaving(true);
    try {
      const session = await updateCurrentUser(changes);
      setUser(session.user);
      setProfileName(session.user.name);
      setProfileEmail(session.user.email);
      setProfileFeedback({
        type: 'success',
        message: 'Profil berhasil diperbarui.',
      });
    } catch (saveError: unknown) {
      setProfileFeedback({ type: 'error', message: profileErrorMessage(saveError) });
      if (saveError instanceof ApiError && saveError.status === 401) router.replace('/login');
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Semua field password wajib diisi.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', message: 'Password baru harus memiliki minimal 8 karakter.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Konfirmasi password tidak cocok dengan password baru.' });
      return;
    }

    setPasswordSaving(true);
    try {
      await updatePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVisiblePasswords({ current: false, next: false, confirm: false });
      setPasswordFeedback({
        type: 'success',
        message: 'Password berhasil diperbarui.',
      });
    } catch (saveError: unknown) {
      setPasswordFeedback({ type: 'error', message: passwordErrorMessage(saveError) });
      if (
        saveError instanceof ApiError &&
        saveError.status === 401 &&
        saveError.code !== 'INVALID_CURRENT_PASSWORD' &&
        saveError.code !== 'CURRENT_PASSWORD_INVALID' &&
        saveError.code !== 'INVALID_OLD_PASSWORD'
      ) {
        router.replace('/login');
      }
    } finally {
      setPasswordSaving(false);
    }
  }

  function togglePassword(field: keyof typeof visiblePasswords) {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  }

  if (!user) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Memeriksa sesi…</main>;
  }

  return (
    <div className={`min-h-screen bg-canvas transition-[padding] duration-200 ${sidebarCollapsed ? 'md:pl-0' : 'md:pl-80'}`}>
      <Navbar
        userName={user.name}
        userEmail={user.email}
        role={workspaceRole || 'viewer'}
        profileRole={workspaceRole}
        pageTitle="Pengaturan"
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-9 lg:py-10">
        <div>
          <p className="text-sm font-semibold text-blue-600">Akun &amp; keamanan</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Pengaturan</h1>
          <p className="mt-2 text-sm text-slate-500">Kelola informasi akun dan keamanan akses XecureIT Anda.</p>
        </div>

        <div role="tablist" aria-label="Kategori pengaturan" className="mt-7 flex gap-1 border-b border-slate-200">
          <button
            id="profile-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            aria-controls="profile-panel"
            onClick={() => setActiveTab('profile')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Pengaturan Profil
          </button>
          <button
            id="password-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'password'}
            aria-controls="password-panel"
            onClick={() => setActiveTab('password')}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
              activeTab === 'password'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Ganti Password
          </button>
        </div>

        {activeTab === 'profile' ? (
          <section id="profile-panel" role="tabpanel" aria-labelledby="profile-tab" className="mt-6 grid items-start gap-6 xl:grid-cols-[.8fr_1.2fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
              <div>
                <h2 className="font-bold text-ink">Ringkasan akun</h2>
                <p className="mt-1 text-sm text-slate-500">Informasi sesi dan ruang kerja XecureIT Anda.</p>
              </div>
              <dl className="mt-5 divide-y divide-slate-100">
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">Nama</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-800">{user.name}</dd>
                </div>
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">Email</dt>
                  <dd className="mt-1 break-all text-sm font-semibold text-slate-800">{user.email}</dd>
                </div>
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">Status sesi</dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Aktif
                  </dd>
                </div>
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">Peran ruang kerja</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-800">
                    {workspaceRoleLoading ? 'Memuat…' : roleTitle(workspaceRole)}
                  </dd>
                  <p className="mt-1 text-xs text-slate-400">Ditentukan dari akses dokumen yang tersedia.</p>
                </div>
              </dl>
              {workspaceRoleError && (
                <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  {workspaceRoleError}
                </p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
              <div>
                <h2 className="font-bold text-ink">Informasi profil</h2>
                <p className="mt-1 text-sm text-slate-500">Perbarui nama dan email akun Anda.</p>
              </div>
              <form noValidate onSubmit={submitProfile} className="mt-5 space-y-4">
                <FeedbackMessage feedback={profileFeedback} />
                <label htmlFor="profile-name" className="block">
                  <span className="text-sm font-medium text-slate-700">Nama Lengkap</span>
                  <input
                    id="profile-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={profileName}
                    onChange={(event) => { setProfileName(event.target.value); setProfileFeedback(null); }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                  />
                </label>
                <label htmlFor="profile-email" className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={profileEmail}
                    onChange={(event) => { setProfileEmail(event.target.value); setProfileFeedback(null); }}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
                  />
                </label>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {profileSaving ? 'Memproses…' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </article>
          </section>
        ) : (
          <section id="password-panel" role="tabpanel" aria-labelledby="password-tab" className="mt-6">
            <article className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-7">
              <div>
                <h2 className="font-bold text-ink">Ganti Password</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Gunakan password minimal 8 karakter untuk menjaga keamanan akun Anda.</p>
              </div>
              <form noValidate onSubmit={submitPassword} className="mt-5 space-y-4">
                <FeedbackMessage feedback={passwordFeedback} />
                <PasswordField
                  id="current-password"
                  label="Password Lama"
                  value={currentPassword}
                  visible={visiblePasswords.current}
                  onChange={(value) => { setCurrentPassword(value); setPasswordFeedback(null); }}
                  onToggle={() => togglePassword('current')}
                  autoComplete="current-password"
                />
                <PasswordField
                  id="new-password"
                  label="Password Baru"
                  value={newPassword}
                  visible={visiblePasswords.next}
                  onChange={(value) => { setNewPassword(value); setPasswordFeedback(null); }}
                  onToggle={() => togglePassword('next')}
                  autoComplete="new-password"
                />
                <p className="-mt-2 text-xs text-slate-400">Minimal 8 karakter.</p>
                <PasswordField
                  id="confirm-password"
                  label="Konfirmasi Password"
                  value={confirmPassword}
                  visible={visiblePasswords.confirm}
                  onChange={(value) => { setConfirmPassword(value); setPasswordFeedback(null); }}
                  onToggle={() => togglePassword('confirm')}
                  autoComplete="new-password"
                />
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {passwordSaving ? 'Memproses…' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
