import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminGetBoards, type BoardBreakdown } from '../../services/metricsService';

const FAMILY_COLORS: Record<string, string> = {
  arduino: '#4fc3f7',
  esp32: '#a5d6a7',
  rp2040: '#ce93d8',
  'raspberry-pi': '#ef9a9a',
};

function familyBadge(name: string | null) {
  if (!name) return <span style={s.familyOther}>—</span>;
  const color = FAMILY_COLORS[name] ?? '#888';
  return (
    <span style={{ ...s.familyBadge, color, borderColor: color }}>{name}</span>
  );
}

export function AdminBoardsTab() {
  const { t } = useTranslation();
  const [families, setFamilies] = useState<BoardBreakdown[]>([]);
  const [fqbns, setFqbns] = useState<BoardBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rangeDays, setRangeDays] = useState(90);

  useEffect(() => {
    setLoading(true);
    setError('');
    adminGetBoards(rangeDays)
      .then((b) => {
        setFamilies(b.families);
        setFqbns(b.fqbns);
      })
      .catch(() => setError(t('admin.boards.loadFailed')))
      .finally(() => setLoading(false));
  }, [rangeDays, t]);

  if (loading) return <p style={s.muted}>{t('admin.loading')}</p>;
  if (error) return <div style={s.error}>{error}</div>;

  return (
    <div style={s.wrap}>
      <div style={s.rangeRow}>
        <span style={s.muted}>{t('admin.boards.range')}</span>
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            onClick={() => setRangeDays(d)}
            style={d === rangeDays ? s.rangeBtnActive : s.rangeBtn}
          >
            {d === 365 ? '1y' : `${d}d`}
          </button>
        ))}
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>{t('admin.boards.byFamily')}</h3>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t('admin.boards.col.family')}</th>
              <th style={s.thNum}>{t('admin.boards.col.compiles')}</th>
              <th style={s.thNum}>{t('admin.boards.col.errors')}</th>
              <th style={s.thNum}>{t('admin.boards.col.successRate')}</th>
              <th style={s.thNum}>{t('admin.boards.col.runs')}</th>
              <th style={s.thNum}>{t('admin.boards.col.distinctUsers')}</th>
              <th style={s.thNum}>{t('admin.boards.col.distinctProjects')}</th>
            </tr>
          </thead>
          <tbody>
            {families.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#666' }}>
                  {t('admin.boards.noData')}
                </td>
              </tr>
            )}
            {families.map((f) => {
              const success = f.compile_count - f.compile_error_count;
              const rate = f.compile_count > 0 ? (success / f.compile_count) * 100 : 0;
              return (
                <tr key={f.board_family ?? '—'} style={s.tr}>
                  <td style={s.td}>{familyBadge(f.board_family)}</td>
                  <td style={s.tdNum}>{f.compile_count}</td>
                  <td style={s.tdNum}>{f.compile_error_count}</td>
                  <td style={s.tdNum}>{rate.toFixed(1)}%</td>
                  <td style={s.tdNum}>{f.run_count}</td>
                  <td style={s.tdNum}>{f.distinct_users}</td>
                  <td style={s.tdNum}>{f.distinct_projects}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>{t('admin.boards.byFqbn')}</h3>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t('admin.boards.col.fqbn')}</th>
              <th style={s.thNum}>{t('admin.boards.col.compiles')}</th>
              <th style={s.thNum}>{t('admin.boards.col.errors')}</th>
              <th style={s.thNum}>{t('admin.boards.col.successRate')}</th>
              <th style={s.thNum}>{t('admin.boards.col.runs')}</th>
              <th style={s.thNum}>{t('admin.boards.col.distinctUsers')}</th>
              <th style={s.thNum}>{t('admin.boards.col.distinctProjects')}</th>
            </tr>
          </thead>
          <tbody>
            {fqbns.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#666' }}>
                  {t('admin.boards.noData')}
                </td>
              </tr>
            )}
            {fqbns.map((f) => {
              const success = f.compile_count - f.compile_error_count;
              const rate = f.compile_count > 0 ? (success / f.compile_count) * 100 : 0;
              return (
                <tr key={f.board_fqbn ?? '—'} style={s.tr}>
                  <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>
                    {f.board_fqbn ?? '—'}
                  </td>
                  <td style={s.tdNum}>{f.compile_count}</td>
                  <td style={s.tdNum}>{f.compile_error_count}</td>
                  <td style={s.tdNum}>{rate.toFixed(1)}%</td>
                  <td style={s.tdNum}>{f.run_count}</td>
                  <td style={s.tdNum}>{f.distinct_users}</td>
                  <td style={s.tdNum}>{f.distinct_projects}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  rangeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  rangeBtn: {
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#9d9d9d',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  rangeBtnActive: {
    background: '#0e639c',
    border: '1px solid #0e639c',
    borderRadius: 4,
    color: '#fff',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  muted: { color: '#777', fontSize: 13, margin: 0 },
  error: {
    background: '#5a1d1d',
    border: '1px solid #f44747',
    borderRadius: 4,
    color: '#f44747',
    padding: '8px 12px',
    fontSize: 13,
  },
  section: {
    background: '#252526',
    border: '1px solid #3c3c3c',
    borderRadius: 6,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionTitle: { color: '#ccc', fontSize: 14, fontWeight: 600, margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    color: '#9d9d9d',
    padding: '6px 10px',
    borderBottom: '1px solid #3c3c3c',
    fontWeight: 500,
    fontSize: 12,
  },
  thNum: {
    textAlign: 'right',
    color: '#9d9d9d',
    padding: '6px 10px',
    borderBottom: '1px solid #3c3c3c',
    fontWeight: 500,
    fontSize: 12,
  },
  tr: { borderBottom: '1px solid #2d2d2d' },
  td: { color: '#ccc', padding: '6px 10px' },
  tdNum: { color: '#ccc', padding: '6px 10px', textAlign: 'right' as const },
  familyBadge: {
    background: 'transparent',
    border: '1px solid #888',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
  },
  familyOther: { color: '#666', fontSize: 12 },
};
