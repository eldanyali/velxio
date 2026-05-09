import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocalizedHref } from '../../i18n/useLocalizedNavigate';

interface LoginPromptModalProps {
  onClose: () => void;
}

export const LoginPromptModal: React.FC<LoginPromptModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const localize = useLocalizedHref();
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{t('editor.loginPrompt.title')}</h2>
        <p style={styles.body}>{t('editor.loginPrompt.body')}</p>
        <div style={styles.actions}>
          <Link to={localize('/login')} style={styles.primaryBtn}>
            {t('header.auth.signIn')}
          </Link>
          <Link to={localize('/register')} style={styles.secondaryBtn}>
            {t('editor.loginPrompt.createAccount')}
          </Link>
          <button onClick={onClose} style={styles.cancelBtn}>
            {t('editor.loginPrompt.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#252526',
    border: '1px solid #3c3c3c',
    borderRadius: 8,
    padding: '1.75rem',
    width: 340,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  title: { color: '#ccc', margin: 0, fontSize: 18, fontWeight: 600 },
  body: { color: '#9d9d9d', margin: 0, fontSize: 14 },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  primaryBtn: {
    background: '#0e639c',
    color: '#fff',
    padding: '9px',
    borderRadius: 4,
    textDecoration: 'none',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  },
  secondaryBtn: {
    background: 'transparent',
    color: '#ccc',
    padding: '9px',
    borderRadius: 4,
    textDecoration: 'none',
    textAlign: 'center',
    fontSize: 14,
    border: '1px solid #555',
  },
  cancelBtn: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    padding: '6px',
    cursor: 'pointer',
    fontSize: 13,
  },
};
