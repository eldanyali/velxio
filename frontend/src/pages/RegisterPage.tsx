import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { register, initiateGoogleLogin } from '../services/authService';
import { useAuthStore } from '../store/useAuthStore';
import { useLocalizedHref } from '../i18n/useLocalizedNavigate';
import { RESERVED_USERNAMES } from '../utils/reservedUsernames';
import { useSEO } from '../utils/useSEO';
import { trackSignUp } from '../utils/analytics';

export const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const localize = useLocalizedHref();
  useSEO({
    title: 'Create Account — Velxio',
    description:
      'Create a free Velxio account to save your Arduino projects and share simulations.',
    url: 'https://velxio.dev/register',
    noindex: true,
  });
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateUsername = (name: string): string | null => {
    const lower = name.toLowerCase();
    if (RESERVED_USERNAMES.has(lower)) return t('auth.register.errors.reserved');
    if (!/^[a-z0-9_-]{3,30}$/.test(lower)) return t('auth.register.errors.usernameRules');
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const usernameErr = validateUsername(username);
    if (usernameErr) {
      setError(usernameErr);
      return;
    }
    if (password.length < 8) {
      setError(t('auth.register.errors.passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      const user = await register(username.toLowerCase(), email, password);
      trackSignUp('email');
      setUser(user);
      navigate(localize('/editor'));
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('auth.register.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-page">
      <div className="ap-card">
        <h1 className="ap-card-title">{t('auth.register.title')}</h1>
        <p className="ap-card-sub">{t('auth.register.subtitle')}</p>

        {error && <div className="ap-error">{error}</div>}

        <form onSubmit={handleSubmit} className="ap-form">
          <div className="ap-field">
            <label className="ap-label">{t('auth.register.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="ap-input"
              autoFocus
              placeholder={t('auth.register.usernamePlaceholder')}
            />
          </div>
          <div className="ap-field">
            <label className="ap-label">{t('auth.login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="ap-input"
            />
          </div>
          <div className="ap-field">
            <label className="ap-label">{t('auth.login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="ap-input"
              placeholder={t('auth.register.passwordPlaceholder')}
            />
          </div>
          <button type="submit" disabled={loading} className="ap-btn-primary">
            {loading ? t('auth.register.creating') : t('auth.register.create')}
          </button>
        </form>

        <div className="ap-divider">{t('auth.login.or')}</div>

        <button
          onClick={() => {
            trackSignUp('google');
            initiateGoogleLogin();
          }}
          className="ap-btn-white"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          {t('auth.login.continueGoogle')}
        </button>

        <p className="ap-footer">
          {t('auth.register.haveAccount')}{' '}
          <Link to={localize('/login')} className="ap-link">
            {t('header.auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
};
