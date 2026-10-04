// src/views/EogRuneAnalysis.tsx — Análisis post-partida del duelo de línea.
// Compara las runas y los items QUE LLEVASTE contra los que OP.GG recomienda
// para ese matchup concreto (tu campeón vs el rival de tu carril).
import { useEffect, useMemo, useState } from 'react';
import { ChampIcon, ItemIcon, RuneIcon, type PatchInfo } from './shared';

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lee un campo del bloque EOG probando las variantes de nombre del LCU. */
const st = (o: any, ...keys: string[]): any => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
    if (o.stats && typeof o.stats === 'object' && o.stats[k] !== undefined) return o.stats[k];
  }
  return undefined;
};

export interface UsedRunes {
  primaryStyleId: number;
  subStyleId: number;
  perkIds: number[]; // 6 runas + 3 fragmentos si el cliente los manda
}

/** Runas que llevó el jugador, desde el bloque EOG (nombres muy variables). */
export function readUsedRunes(raw: any): UsedRunes {
  const perks: number[] = [];
  for (let i = 0; i < 6; i++) {
    perks.push(num(st(raw, `PERK${i}`, `perk${i}`, `PERK${i}_VAR1`) ?? 0));
  }
  for (let i = 0; i < 3; i++) {
    const shard = st(raw, `STAT_PERK_${i}`, `statPerk${i}`, `PERK_STAT_${i}`);
    if (shard !== undefined) perks.push(num(shard));
  }
  return {
    primaryStyleId: num(st(raw, 'PERK_PRIMARY_STYLE', 'perkPrimaryStyle', 'primaryStyle')),
    subStyleId: num(st(raw, 'PERK_SUB_STYLE', 'perkSubStyle', 'subStyle')),
    perkIds: perks.filter((p) => p > 0),
  };
}

interface Props {
  patch: PatchInfo | null;
  myChampion: string;
  myItems: number[];
  usedRunes: UsedRunes;
  /** Campeones del equipo enemigo (para elegir el rival de línea). */
  enemyChampions: string[];
  /** Rival detectado por posición, si el EOG la traía. */
  defaultRival?: string;
  position?: string;
}

const Chip = ({ ok, children }: { ok: boolean; children: any }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', borderRadius: 4,
    color: ok ? 'var(--ax-green)' : 'var(--ax-neg)',
    border: `1px solid ${ok ? 'rgba(61,220,151,.38)' : 'rgba(255,107,118,.38)'}`,
    background: ok ? 'rgba(61,220,151,.12)' : 'rgba(255,107,118,.12)',
    padding: '1px 6px',
  }}>
    {ok ? '✓' : '✕'} {children}
  </span>
);

export default function EogRuneAnalysis({
  patch, myChampion, myItems, usedRunes, enemyChampions, defaultRival = '', position = 'MIDDLE',
}: Props) {
  const [rival, setRival] = useState(defaultRival || enemyChampions[0] || '');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!myChampion || !rival) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    window.atak
      .matchupData(myChampion, rival, position)
      .then((d: any) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'OP.GG no respondió'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [myChampion, rival, position]);

  const rec = data?.runes?.[0];

  // Comparación runa a runa: lo que llevaste vs lo recomendado en ese duelo.
  const diff = useMemo(() => {
    if (!rec) return null;
    const recIds: number[] = [
      ...(rec.primaryIds || []).slice(0, 4),
      ...(rec.secondaryIds || []).slice(0, 2),
    ];
    const recNames: string[] = [
      ...(rec.primaryNames || []).slice(0, 4),
      ...(rec.secondaryNames || []).slice(0, 2),
    ];
    const used = new Set(usedRunes.perkIds);
    const missing = recIds.filter((id) => !used.has(id));
    const hits = recIds.filter((id) => used.has(id));
    return {
      recIds,
      recNames,
      missing,
      hits,
      keystoneOk: usedRunes.perkIds[0] ? usedRunes.perkIds[0] === recIds[0] : false,
      pathOk: usedRunes.primaryStyleId === rec.primaryPathId,
      score: recIds.length ? Math.round((hits.length / recIds.length) * 100) : null,
    };
  }, [rec, usedRunes]);

  const recCore: number[] = data?.coreItems?.[0]?.ids ?? [];
  const recCoreNames: string[] = data?.coreItems?.[0]?.names ?? [];
  const usedSet = new Set(myItems.filter(Boolean));

  if (!myChampion) {
    return <div className="label" style={{ color: 'var(--text-faint)' }}>Sin campeón local en el bloque EOG.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
      {/* Selector de rival */}
      <div className="panel" style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="label">TU DUELO</span>
          <ChampIcon patch={patch} name={myChampion} size={30} />
          <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>vs</span>
          {enemyChampions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setRival(c)}
              title={`Comparar contra ${c}`}
              style={{
                padding: 0, background: 'transparent', cursor: 'pointer',
                border: c === rival ? '2px solid #fff' : '2px solid transparent',
                opacity: c === rival ? 1 : 0.5,
              }}
            >
              <ChampIcon patch={patch} name={c} size={30} enemy />
            </button>
          ))}
          {!enemyChampions.length && (
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Sin equipo enemigo en los datos</span>
          )}
        </div>
        {data && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-soft)' }}>
            {data.winRate != null
              ? <>Winrate global de <strong style={{ color: '#fff' }}>{myChampion}</strong> vs {rival}: <strong style={{ color: data.winRate >= 50 ? 'var(--ax-green)' : 'var(--ax-neg)' }}>{data.winRate}%</strong> en {data.play} partidas (OP.GG)</>
              : <>Sin muestra de este duelo en OP.GG</>}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10 }}>
          <span className="dot" /><span className="label">CONSULTANDO EL MATCHUP…</span>
        </div>
      )}
      {error && <div className="tip hot">{error}</div>}

      {/* Runas: llevadas vs recomendadas */}
      {rec && diff && (
        <div className="panel" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div className="label">RUNAS · LO QUE LLEVASTE VS EL DUELO</div>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {rec.play} partidas del duelo{rec.winRate != null ? ` · ${rec.winRate}% WR` : ''}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>LLEVASTE</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                {usedRunes.perkIds.length ? usedRunes.perkIds.slice(0, 6).map((id, i) => (
                  <RuneIcon key={i} id={id} patch={patch} size={i === 0 ? 38 : 24} keystone={i === 0} hot={i === 0} />
                )) : <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>El cliente no mandó tus runas</span>}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6, color: 'var(--text)' }}>
                RECOMENDADO VS {String(rival).toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                {diff.recIds.map((id, i) => (
                  <RuneIcon key={i} id={id} patch={patch} size={i === 0 ? 38 : 24} keystone={i === 0} hot={i === 0}
                    title={diff.recNames[i]} />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <Chip ok={diff.pathOk}>{diff.pathOk ? 'Rama correcta' : `Meta usa ${rec.primaryPathName}`}</Chip>
            <Chip ok={diff.keystoneOk}>
              {diff.keystoneOk ? 'Keystone correcta' : `Meta usa ${diff.recNames[0] || 'otra keystone'}`}
            </Chip>
            {diff.score != null && (
              <Chip ok={diff.score >= 70}>{diff.score}% de coincidencia</Chip>
            )}
          </div>

          {diff.missing.length > 0 && (
            <div className="tip" style={{ marginTop: 8 }}>
              Te faltaron: <strong>{diff.missing.map((id) => diff.recNames[diff.recIds.indexOf(id)] || id).join(' · ')}</strong>
            </div>
          )}
        </div>
      )}

      {/* Items core */}
      {recCore.length > 0 && (
        <div className="panel" style={{ padding: '12px 14px' }}>
          <div className="label" style={{ marginBottom: 10 }}>ITEMS CORE DEL DUELO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>LLEVASTE</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {myItems.filter(Boolean).map((id, i) => (
                  <ItemIcon key={i} patch={patch} id={id} size={30} />
                ))}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6, color: 'var(--text)' }}>RECOMENDADO</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {recCore.map((id, i) => (
                  <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
                    <ItemIcon patch={patch} id={id} size={30} />
                    {!usedSet.has(id) && (
                      <span style={{
                        position: 'absolute', inset: 0, border: '2px solid var(--crimson)', borderRadius: 4,
                        pointerEvents: 'none',
                      }} />
                    )}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 5 }}>
                {recCoreNames.join(' → ')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tip del duelo */}
      {data?.tip && (
        <div className="panel" style={{ padding: '10px 12px' }}>
          <div className="label" style={{ marginBottom: 6, color: 'var(--text)' }}>
            CÓMO SE JUEGA VS {String(rival).toUpperCase()} (OP.GG, EN)
          </div>
          <div className="tip hot">{data.tip}</div>
        </div>
      )}
    </div>
  );
}
