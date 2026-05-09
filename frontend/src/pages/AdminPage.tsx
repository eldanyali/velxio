import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { useSEO } from '../utils/useSEO';
import {
  getAdminSetupStatus,
  createFirstAdmin,
  adminListUsers,
  adminUpdateUser,
  adminDeleteUser,
  adminListProjects,
  adminDeleteProject,
  type AdminUserResponse,
  type AdminProjectResponse,
  type AdminUserUpdateRequest,
} from '../services/adminService';
import { AdminDashboardTab } from '../components/admin/AdminDashboardTab';
import { AdminBoardsTab } from '../components/admin/AdminBoardsTab';
import { UserActivityModal } from '../components/admin/UserActivityModal';
import { countryFlag } from '../utils/countryFlag';

type Tab = 'dashboard' | 'users' | 'projects' | 'boards';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ── Edit User Modal ───────────────────────────────────────────────────────────

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: AdminUserResponse;
  onClose: () => void;
  onSave: (id: string, body: AdminUserUpdateRequest) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const body: AdminUserUpdateRequest = {};
    if (username !== user.username) body.username = username;
    if (email !== user.email) body.email = email;
    if (password) body.password = password;
    if (isAdmin !== user.is_admin) body.is_admin = isAdmin;
    if (isActive !== user.is_active) body.is_active = isActive;
    try {
      await onSave(user.id, body);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('admin.errors.save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.box} onClick={(e) => e.stopPropagation()}>
        <h2 style={modalStyles.title}>{t('admin.editUser.title')}</h2>
        {error && <div style={modalStyles.error}>{error}</div>}

        <label style={modalStyles.label}>{t('admin.editUser.username')}</label>
        <input
          style={modalStyles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <label style={modalStyles.label}>{t('admin.editUser.email')}</label>
        <input style={modalStyles.input} value={email} onChange={(e) => setEmail(e.target.value)} />

        <label style={modalStyles.label}>{t('admin.editUser.newPassword')}</label>
        <input
          style={modalStyles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('admin.editUser.passwordPlaceholder')}
        />

        <div style={modalStyles.checkRow}>
          <input
            id="is_admin"
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          <label htmlFor="is_admin" style={modalStyles.checkLabel}>
            {t('admin.editUser.admin')}
          </label>
        </div>

        <div style={modalStyles.checkRow}>
          <input
            id="is_active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="is_active" style={modalStyles.checkLabel}>
            {t('admin.editUser.active')}
          </label>
        </div>

        <div style={modalStyles.actions}>
          <button style={modalStyles.cancelBtn} onClick={onClose} disabled={saving}>
            {t('admin.editUser.cancel')}
          </button>
          <button style={modalStyles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? t('admin.editUser.saving') : t('admin.editUser.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  box: {
    background: '#252526',
    border: '1px solid #3c3c3c',
    borderRadius: 8,
    padding: '1.5rem',
    width: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  title: { color: '#ccc', margin: 0, fontSize: 18, fontWeight: 600 },
  label: { color: '#9d9d9d', fontSize: 13 },
  input: {
    background: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: 4,
    padding: '7px 10px',
    color: '#ccc',
    fontSize: 14,
    outline: 'none',
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8 },
  checkLabel: { color: '#ccc', fontSize: 14 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cancelBtn: {
    background: '#3c3c3c',
    border: 'none',
    borderRadius: 4,
    color: '#ccc',
    padding: '7px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  saveBtn: {
    background: '#0e639c',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    padding: '7px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  error: {
    background: '#5a1d1d',
    border: '1px solid #f44747',
    borderRadius: 4,
    color: '#f44747',
    padding: '7px 12px',
    fontSize: 13,
  },
};

// ── Setup screen ──────────────────────────────────────────────────────────────

function SetupScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('admin.setup.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      await createFirstAdmin(username, email, password);
      onDone();
      navigate('/login?redirect=/admin');
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('admin.setup.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.cardTitle}>{t('admin.setup.title')}</h1>
        <p style={s.muted}>{t('admin.setup.body')}</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleCreate} style={s.form}>
          <label style={s.label}>{t('admin.editUser.username')}</label>
          <input
            style={s.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            placeholder="admin"
          />
          <label style={s.label}>{t('admin.editUser.email')}</label>
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="admin@example.com"
          />
          <label style={s.label}>{t('admin.setup.password')}</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={t('admin.editUser.passwordPlaceholder')}
          />
          <label style={s.label}>{t('admin.setup.confirmPassword')}</label>
          <input
            style={s.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} style={s.primaryBtn}>
            {loading ? t('admin.setup.creating') : t('admin.setup.createAdmin')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Not-admin screen ──────────────────────────────────────────────────────────

function NotAdminScreen() {
  const { t } = useTranslation();
  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.cardTitle}>{t('admin.notAdmin.title')}</h1>
        <p style={s.muted}>{t('admin.notAdmin.body')}</p>
        <Link to="/login?redirect=/admin" style={s.primaryBtn}>
          {t('admin.notAdmin.goLogin')}
        </Link>
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<AdminUserResponse | null>(null);
  const [activityUser, setActivityUser] = useState<AdminUserResponse | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    adminListUsers()
      .then(setUsers)
      .catch(() => setError(t('admin.users.loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = async (id: string, body: AdminUserUpdateRequest) => {
    const updated = await adminUpdateUser(id, body);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  };

  const handleDelete = async (user: AdminUserResponse) => {
    if (!confirm(t('admin.users.confirmDelete', { username: user.username })))
      return;
    try {
      await adminDeleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('admin.users.deleteFailed'));
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={s.tabContent}>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.searchRow}>
        <input
          style={s.searchInput}
          placeholder={t('admin.users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={s.muted}>
          {t('admin.users.count', { count: filtered.length })}
        </span>
      </div>

      {loading ? (
        <p style={s.muted}>{t('admin.loading')}</p>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t('admin.users.col.username')}</th>
                <th style={s.th}>{t('admin.users.col.email')}</th>
                <th style={s.th}>{t('admin.users.col.role')}</th>
                <th style={s.th}>{t('admin.users.col.status')}</th>
                <th style={s.th}>{t('admin.users.col.projects')}</th>
                <th style={s.th}>{t('admin.users.col.compiles')}</th>
                <th style={s.th}>{t('admin.users.col.runs')}</th>
                <th style={s.th}>{t('admin.users.col.boards')}</th>
                <th style={s.th}>{t('admin.users.col.country')}</th>
                <th style={s.th}>{t('admin.users.col.lastActive')}</th>
                <th style={s.th}>{t('admin.users.col.joined')}</th>
                <th style={s.th}>{t('admin.users.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const errPct =
                  u.total_compiles > 0
                    ? ((u.total_compile_errors / u.total_compiles) * 100).toFixed(0)
                    : null;
                return (
                  <tr key={u.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.username}>{u.username}</span>
                      {u.id === currentUserId && <span style={s.youBadge}>you</span>}
                    </td>
                    <td style={s.td}>{u.email}</td>
                    <td style={s.td}>
                      <span style={u.is_admin ? s.adminBadge : s.userBadge}>
                        {u.is_admin ? 'admin' : 'user'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={u.is_active ? s.activeBadge : s.inactiveBadge}>
                        {u.is_active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td style={s.td}>{u.project_count}</td>
                    <td style={s.td} title={errPct ? `${errPct}% errors` : undefined}>
                      {u.total_compiles}
                      {errPct ? <span style={s.errPct}> ({errPct}% err)</span> : null}
                    </td>
                    <td style={s.td}>{u.total_runs}</td>
                    <td style={s.td}>
                      {u.boards_used.length === 0
                        ? '—'
                        : u.boards_used.map((b) => (
                            <span key={b} style={s.boardChip}>
                              {b}
                            </span>
                          ))}
                    </td>
                    <td
                      style={s.td}
                      title={
                        u.signup_country && u.signup_country !== u.last_country
                          ? `Signed up: ${u.signup_country}\nLast: ${u.last_country ?? '—'}`
                          : u.last_country ?? 'Unknown'
                      }
                    >
                      <span style={{ fontSize: 16 }}>{countryFlag(u.last_country)}</span>{' '}
                      <span style={{ fontSize: 11, color: '#888' }}>
                        {u.last_country ?? '—'}
                      </span>
                    </td>
                    <td style={s.td}>{formatRelative(u.last_active_at)}</td>
                    <td style={s.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td style={s.td}>
                      <button style={s.activityBtn} onClick={() => setActivityUser(u)}>
                        {t('admin.users.actions.activity')}
                      </button>
                      <button style={s.editBtn} onClick={() => setEditUser(u)}>
                        {t('admin.users.actions.edit')}
                      </button>
                      {u.id !== currentUserId && (
                        <button style={s.deleteBtn} onClick={() => handleDelete(u)}>
                          {t('admin.users.actions.delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ ...s.td, textAlign: 'center', color: '#666' }}>
                    {t('admin.users.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSave} />
      )}

      {activityUser && (
        <UserActivityModal
          userId={activityUser.id}
          username={activityUser.username}
          onClose={() => setActivityUser(null)}
        />
      )}
    </div>
  );
}

// ── Projects tab ──────────────────────────────────────────────────────────────

function ProjectsTab() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<AdminProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminListProjects()
      .then(setProjects)
      .catch(() => setError(t('admin.projects.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleDelete = async (project: AdminProjectResponse) => {
    if (!confirm(t('admin.projects.confirmDelete', { name: project.name }))) return;
    try {
      await adminDeleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('admin.projects.deleteFailed'));
    }
  };

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.owner_username.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={s.tabContent}>
      {error && <div style={s.error}>{error}</div>}
      <div style={s.searchRow}>
        <input
          style={s.searchInput}
          placeholder={t('admin.projects.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={s.muted}>
          {t('admin.projects.count', { count: filtered.length })}
        </span>
      </div>

      {loading ? (
        <p style={s.muted}>{t('admin.loading')}</p>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t('admin.projects.col.name')}</th>
                <th style={s.th}>{t('admin.projects.col.owner')}</th>
                <th style={s.th}>{t('admin.projects.col.board')}</th>
                <th style={s.th}>{t('admin.projects.col.visibility')}</th>
                <th style={s.th}>{t('admin.projects.col.compiles')}</th>
                <th style={s.th}>{t('admin.projects.col.runs')}</th>
                <th style={s.th}>{t('admin.projects.col.updates')}</th>
                <th style={s.th}>{t('admin.projects.col.lastCompile')}</th>
                <th style={s.th}>{t('admin.projects.col.updated')}</th>
                <th style={s.th}>{t('admin.users.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={s.tr}>
                  <td style={s.td}>
                    <Link
                      to={`/project/${p.id}`}
                      style={{ color: '#4fc3f7', textDecoration: 'none' }}
                      target="_blank"
                      title={p.is_public ? undefined : t('admin.projects.privateTitle')}
                    >
                      {p.name}
                      {!p.is_public && <span style={s.lockIcon}> 🔒</span>}
                    </Link>
                  </td>
                  <td style={s.td}>
                    <Link
                      to={`/${p.owner_username}`}
                      style={{ color: '#9d9d9d', textDecoration: 'none' }}
                      target="_blank"
                    >
                      {p.owner_username}
                    </Link>
                  </td>
                  <td style={s.td}>{p.board_type}</td>
                  <td style={s.td}>
                    <span style={p.is_public ? s.activeBadge : s.inactiveBadge}>
                      {p.is_public ? t('admin.projects.public') : t('admin.projects.private')}
                    </span>
                  </td>
                  <td style={s.td}>
                    {p.compile_count}
                    {p.compile_error_count > 0 && (
                      <span style={s.errPct}> ({p.compile_error_count} err)</span>
                    )}
                  </td>
                  <td style={s.td}>{p.run_count}</td>
                  <td style={s.td}>{p.update_count}</td>
                  <td style={s.td}>{formatRelative(p.last_compiled_at)}</td>
                  <td style={s.td}>{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td style={s.td}>
                    <button style={s.deleteBtn} onClick={() => handleDelete(p)}>
                      {t('admin.users.actions.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ ...s.td, textAlign: 'center', color: '#666' }}>
                    {t('admin.projects.noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

function AdminDashboard() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('dashboard');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div style={s.dashboard}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <Link to="/" style={s.backLink}>
            Velxio
          </Link>
          <span style={s.headerSep}>/</span>
          <span style={s.headerTitle}>{t('admin.panel')}</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.adminLabel}>{user?.username}</span>
          <button style={s.logoutBtn} onClick={handleLogout}>
            {t('admin.logout')}
          </button>
        </div>
      </div>

      <div data-velxio-slot="admin-tabs" style={s.tabs}>
        <button
          style={tab === 'dashboard' ? s.tabActive : s.tabBtn}
          onClick={() => setTab('dashboard')}
        >
          {t('admin.tabs.dashboard')}
        </button>
        <button style={tab === 'users' ? s.tabActive : s.tabBtn} onClick={() => setTab('users')}>
          {t('admin.tabs.users')}
        </button>
        <button
          style={tab === 'projects' ? s.tabActive : s.tabBtn}
          onClick={() => setTab('projects')}
        >
          {t('admin.tabs.projects')}
        </button>
        <button
          style={tab === 'boards' ? s.tabActive : s.tabBtn}
          onClick={() => setTab('boards')}
        >
          {t('admin.tabs.boards')}
        </button>
      </div>
      <div data-velxio-slot="admin-tab-content" />

      {tab === 'dashboard' && (
        <div style={s.tabContent}>
          <AdminDashboardTab />
        </div>
      )}
      {tab === 'users' && <UsersTab currentUserId={user?.id || ''} />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'boards' && (
        <div style={s.tabContent}>
          <AdminBoardsTab />
        </div>
      )}
    </div>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────────────

type AdminPageState = 'loading' | 'setup' | 'not-admin' | 'dashboard';

export const AdminPage: React.FC = () => {
  useSEO({
    title: 'Admin — Velxio',
    description: 'Velxio administration panel.',
    url: 'https://velxio.dev/admin',
    noindex: true,
  });

  const user = useAuthStore((s) => s.user);
  const [pageState, setPageState] = useState<AdminPageState>('loading');

  useEffect(() => {
    getAdminSetupStatus()
      .then(({ has_admin }) => {
        if (!has_admin) {
          setPageState('setup');
          return;
        }
        if (!user || !user.is_admin) {
          setPageState('not-admin');
          return;
        }
        setPageState('dashboard');
      })
      .catch(() => setPageState('not-admin'));
  }, [user]);

  if (pageState === 'loading') {
    return (
      <div style={{ ...s.page, alignItems: 'center', justifyContent: 'center' }}>
        <p style={s.muted}>Loading…</p>
      </div>
    );
  }

  if (pageState === 'setup') {
    return <SetupScreen onDone={() => setPageState('not-admin')} />;
  }

  if (pageState === 'not-admin') {
    return <NotAdminScreen />;
  }

  return <AdminDashboard />;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#1e1e1e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },
  card: {
    background: '#252526',
    border: '1px solid #3c3c3c',
    borderRadius: 8,
    padding: '2rem',
    width: 380,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardTitle: { color: '#ccc', margin: 0, fontSize: 22, fontWeight: 600 },
  muted: { color: '#777', fontSize: 13, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { color: '#9d9d9d', fontSize: 13 },
  input: {
    background: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: 4,
    padding: '8px 10px',
    color: '#ccc',
    fontSize: 14,
    outline: 'none',
  },
  primaryBtn: {
    display: 'block',
    textAlign: 'center',
    textDecoration: 'none',
    marginTop: 8,
    background: '#0e639c',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    padding: '9px',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
  },
  error: {
    background: '#5a1d1d',
    border: '1px solid #f44747',
    borderRadius: 4,
    color: '#f44747',
    padding: '8px 12px',
    fontSize: 13,
  },
  // Dashboard
  dashboard: {
    minHeight: '100vh',
    background: '#1e1e1e',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#252526',
    borderBottom: '1px solid #3c3c3c',
    padding: '0 1.5rem',
    height: 48,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  backLink: { color: '#4fc3f7', textDecoration: 'none', fontSize: 14, fontWeight: 600 },
  headerSep: { color: '#555', fontSize: 14 },
  headerTitle: { color: '#ccc', fontSize: 14 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  adminLabel: { color: '#9d9d9d', fontSize: 13 },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #555',
    borderRadius: 4,
    color: '#ccc',
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
  },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid #3c3c3c', padding: '0 1.5rem' },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#9d9d9d',
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  tabActive: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #0e639c',
    color: '#fff',
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  tabContent: { padding: '1.5rem', flex: 1 },
  searchRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  searchInput: {
    background: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: 4,
    padding: '7px 10px',
    color: '#ccc',
    fontSize: 14,
    outline: 'none',
    width: 300,
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    color: '#9d9d9d',
    padding: '8px 12px',
    borderBottom: '1px solid #3c3c3c',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #2d2d2d' },
  td: { color: '#ccc', padding: '10px 12px', verticalAlign: 'middle' },
  username: { fontWeight: 500 },
  youBadge: {
    marginLeft: 6,
    background: '#2d4a2d',
    color: '#73c991',
    border: '1px solid #4a7a4a',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
  },
  adminBadge: {
    background: '#2d3a5a',
    color: '#9cdcfe',
    border: '1px solid #4a6a9a',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
  },
  userBadge: {
    background: '#3a3a3a',
    color: '#9d9d9d',
    border: '1px solid #555',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
  },
  activeBadge: {
    background: '#2d4a2d',
    color: '#73c991',
    border: '1px solid #4a7a4a',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
  },
  inactiveBadge: {
    background: '#4a2d2d',
    color: '#f14c4c',
    border: '1px solid #7a4a4a',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
  },
  editBtn: {
    background: '#3c3c3c',
    border: 'none',
    borderRadius: 4,
    color: '#ccc',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 4,
  },
  deleteBtn: {
    background: '#5a1d1d',
    border: 'none',
    borderRadius: 4,
    color: '#f44747',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  activityBtn: {
    background: '#2d3a5a',
    border: 'none',
    borderRadius: 4,
    color: '#9cdcfe',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 4,
  },
  errPct: { color: '#f48771', fontSize: 11, marginLeft: 4 },
  boardChip: {
    display: 'inline-block',
    background: '#2d3a5a',
    color: '#9cdcfe',
    border: '1px solid #4a6a9a',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
    marginRight: 4,
  },
  lockIcon: { fontSize: 10, opacity: 0.7, marginLeft: 4 },
};
