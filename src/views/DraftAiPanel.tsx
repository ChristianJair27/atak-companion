// src/views/DraftAiPanel.tsx — panel "ATAK Coach": análisis IA del draft con
// build personalizada (runas, 6 items, situacionales, hechizos, plan, amenazas).
// Se usa en el champ select real y en la herramienta de draft. Pide el análisis
// al main (draft-analyze) con debounce cuando cambia el draft.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { spellIconUrl, type PatchInfo } from './shared';
import { HxArrow, HxItem, HxPanel, HxRing, HxRuneTree } from './hextech';
import { EASE, swap } from '../motion';

export interface DraftAiSide { championName: string; championId?: number; position?: string; tags?: string[] }
export interface DraftAiRequest {
  me: DraftAiSide; position: string; allies: DraftAiSide[]; enemies: DraftAiSide[]; rival?: string;
  mode?: 'ranked' | 'aram' | 'arena'; force?: boolean;
}
export interface DraftAnalysis {
  provider: 'claude' | 'ollama' | 'backend' | 'rules';
  model: string;
  resumen: string;
  plan: string[];
  amenazas: Array<{ champion: string; porQue: string }>;
  runas: { primaryPathId: number; secondaryPathId: number; ids: number[]; shards: number[]; razon: string; source: string };
  items: { inicio: number[]; build: number[]; situacionales: Array<{ id: number; cuando: string }>; razon: string };
  hechizos: number[];
  confianza: number;
  runePage: { name: string; primaryStyleId: number; subStyleId: number; selectedPerkIds: number[] } | null;
  tookMs: number;
}

let namesCache: Promise<{ items: Record<number, string>; runes: Record<number, string> }> | null = null;
function useAiNames() {
  const [names, setNames] = useState<{ items: Record<number, string>; runes: Record<number, string> }>({ items: {}, runes: {} });
  useEffect(() => {
    if (!namesCache) namesCache = window.atak.draftAiNames().catch(() => ({ items: {}, runes: {} }));
    let alive = true;
    namesCache.then((n) => { if (alive) setNames(n); });
    return () => { alive = false; };
  }, []);
  return names;
}

const PROVIDER_LABEL: Record<DraftAnalysis['provider'], string> = { claude: 'Claude', ollama: 'IA local', backend: 'IA ATAK (nube)', rules: 'Sin IA · OP.GG + reglas' };

export default function DraftAiPanel({ patch, request, enabled = true, onRunesApplied, compact }: {
  patch: PatchInfo | null;
  /** null = aún no hay campeón propio; el panel muestra la espera. */
  request: DraftAiRequest | null;
  enabled?: boolean;
  onRunesApplied?: (r: { ok: boolean; error?: string }) => void;
  compact?: boolean;
}) {
  const names = useAiNames();
  const [state, setState] = useState<{ key: string; loading: boolean; data: DraftAnalysis | null; error: string }>({ key: '', loading: false, data: null, error: '' });
  const [applying, setApplying] = useState(false);
  const seq = useRef(0);

  const key = useMemo(() => request ? JSON.stringify([request.me.championName, request.position, request.allies.map((a) => a.championName), request.enemies.map((e) => e.championName), request.rival || '', request.mode || '']) : '', [request]);
  const enemyCount = request?.enemies.filter((e) => e.championName).length ?? 0;

  const run = (force = false) => {
    if (!request || !enabled) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, key, loading: true, error: '' }));
    window.atak.draftAnalyze({ ...request, force })
      .then((d) => { if (seq.current === my) setState({ key, loading: false, data: d, error: d ? '' : 'La IA no respondió; reintenta.' }); })
      .catch((e: any) => { if (seq.current === my) setState({ key, loading: false, data: null, error: e?.message || 'Error' }); });
  };

  // Debounce: el draft cambia en cada pick; analizar 1.5 s después del último cambio.
  useEffect(() => {
    if (!request || !enabled || !request.me.championName || enemyCount === 0) return;
    const t = setTimeout(() => run(false), 1500);
    return () => clearTimeout(t);
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = state.data;
  const stale = d && state.key !== key;
  const itemName = (id: number) => names.items[id] || String(id);

  return (
    <HxPanel corners tone={d && !state.loading ? 'cyan' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="hx-label cyan" style={{ fontSize: 11 }}>ATAK Coach · análisis IA del draft</span>
        {d && <span className="hx-pill" style={{ fontSize: 9 }}>{PROVIDER_LABEL[d.provider]}{d.provider !== 'rules' ? ` · ${d.model}` : ''}</span>}
        {d && <span className="hx-faint" style={{ fontSize: 10 }}>{(d.tookMs / 1000).toFixed(1)} s</span>}
        <span style={{ flex: 1 }} />
        {request && request.me.championName && (
          <button type="button" className="hx-btn ghost no-drag" style={{ minHeight: 28, padding: '0 10px', fontSize: 10 }} disabled={state.loading} onClick={() => run(true)}>
            {state.loading ? 'Analizando…' : d ? 'Reanalizar' : 'Analizar'}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!request || !request.me.championName ? (
          <motion.div key="wait" {...swap} className="hx-muted" style={{ fontSize: 12, padding: '6px 0' }}>
            Elige tu campeón: en cuanto haya picks enemigos, la IA arma runas, items y plan para esta partida.
          </motion.div>
        ) : enemyCount === 0 && !d ? (
          <motion.div key="noenemy" {...swap} className="hx-muted" style={{ fontSize: 12, padding: '6px 0' }}>
            Esperando picks enemigos para personalizar la build…
          </motion.div>
        ) : !d && !state.error ? (
          <motion.div key="loading" {...swap} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <motion.span className="hx-hex cyan" style={{ width: 18, height: 18 }} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}><span className="hx-hex-in" /></motion.span>
            <span className="hx-label cyan">Leyendo el draft y los datos de OP.GG…</span>
          </motion.div>
        ) : d ? (
          <motion.div key={state.key} {...swap} style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: stale || state.loading ? 0.55 : 1 }}>
            {/* Resumen + confianza */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <HxRing pct={Math.round(d.confianza * 100)} size={54} stroke={4} color="var(--hx-cyan)" value={`${Math.round(d.confianza * 100)}%`} label="conf." />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--hx-ink)' }}>{d.resumen}</div>
                {d.amenazas.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {d.amenazas.map((a) => <span key={a.champion} className="hx-pill miss" title={a.porQue} style={{ textTransform: 'none' }}>⚠ {a.champion}: {a.porQue}</span>)}
                  </div>
                )}
              </div>
            </div>

            {/* Plan */}
            {d.plan.length > 0 && (
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, lineHeight: 1.4 }}>
                {d.plan.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.1fr 1fr', gap: 14 }}>
              {/* Runas */}
              {d.runas.ids.length === 6 && (
                <div>
                  <div className="hx-label gold" style={{ marginBottom: 6 }}>Runas para esta partida <span className="hx-faint" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {d.runas.source}</span></div>
                  <HxRuneTree patch={patch} primaryPathId={d.runas.primaryPathId} secondaryPathId={d.runas.secondaryPathId} selected={d.runas.ids} shards={d.runas.shards} compact />
                  {d.runas.razon && <div className="hx-muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{d.runas.razon}</div>}
                  {d.runePage && (
                    <button type="button" className="hx-btn no-drag" style={{ marginTop: 8, minHeight: 32, fontSize: 11 }} disabled={applying}
                      onClick={async () => {
                        setApplying(true);
                        try { onRunesApplied?.(await window.atak.applyRunes(d.runePage!)); }
                        catch (e: any) { onRunesApplied?.({ ok: false, error: e?.message }); }
                        finally { setApplying(false); }
                      }}>
                      {applying ? 'Aplicando…' : 'Poner runas IA en el cliente'}
                    </button>
                  )}
                </div>
              )}

              {/* Items + hechizos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {d.items.inicio.length > 0 && (
                  <div>
                    <div className="hx-label" style={{ marginBottom: 4 }}>Inicio</div>
                    <div className="hx-items">{d.items.inicio.map((id, i) => <HxItem key={`${id}-${i}`} patch={patch} id={id} size={26} title={itemName(id)} />)}</div>
                  </div>
                )}
                <div>
                  <div className="hx-label gold" style={{ marginBottom: 4 }}>Build para esta partida</div>
                  <div className="hx-items">
                    {d.items.build.map((id, i) => (
                      <span key={`${id}-${i}`} style={{ display: 'contents' }}>
                        <HxItem patch={patch} id={id} size={32} core={i > 0 && i <= 3} title={itemName(id)} />
                        {i < d.items.build.length - 1 && <HxArrow />}
                      </span>
                    ))}
                  </div>
                  {d.items.razon && <div className="hx-muted" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.4 }}>{d.items.razon}</div>}
                </div>
                {d.items.situacionales.length > 0 && (
                  <div>
                    <div className="hx-label" style={{ marginBottom: 4 }}>Situacionales</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {d.items.situacionales.map((s) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                          <HxItem patch={patch} id={s.id} size={24} title={itemName(s.id)} />
                          <span><b style={{ color: 'var(--hx-gold-bright)', fontWeight: 600 }}>{itemName(s.id)}</b> <span className="hx-muted">· {s.cuando}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {d.hechizos.length > 0 && (
                  <div>
                    <div className="hx-label" style={{ marginBottom: 4 }}>Hechizos</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {d.hechizos.map((id) => { const u = spellIconUrl(patch, id); return <span key={id} className="hx-item" style={{ width: 28, height: 28 }}>{u && <img src={u} alt="" />}</span>; })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="err" {...swap} style={{ fontSize: 12, color: '#ff9aa0' }}>{state.error || 'Sin análisis todavía.'}</motion.div>
        )}
      </AnimatePresence>
      {d && (stale || state.loading) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }} className="hx-label cyan" style={{ marginTop: 8 }}>
          {state.loading ? 'Actualizando con el nuevo draft…' : 'El draft cambió: reanalizando en breve…'}
        </motion.div>
      )}
    </HxPanel>
  );
}
