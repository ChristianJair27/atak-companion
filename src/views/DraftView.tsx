// src/views/DraftView.tsx — Herramienta de drafteo (pestaña de la main window).
// Simulador de draft: bans y picks de ambos lados, grid de campeones con
// búsqueda/filtro por clase, análisis de composición, sugerencias reales
// (winrate vs el draft enemigo) usando la misma tubería OP.GG del champ select
// y el panel "ATAK Coach" (DraftAiPanel) con runas/items/plan por IA.
// Piel: hextech (cliente de League) + movimiento cinematográfico del champ select.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { champSlug, champSplashUrl, norm, openChampionPage, usePatch } from './shared';
import { HxHex, HxPanel, HxSegmented, HxSlot, HxTabs, champFaceUrl } from './hextech';
import DraftAiPanel, { type DraftAiRequest, type DraftAiSide } from './DraftAiPanel';
import { EASE, rise, staggerParent, swap } from '../motion';
import './champselect-motion.css';
import './draft.css';

type Side = 'blue' | 'red';
type SlotType = 'pick' | 'ban';
type Dock = 'sugs' | 'coach';

interface Slot { side: Side; type: SlotType; idx: number }

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
type Position = typeof POSITIONS[number];
const POS_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JUNGLA', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SOPORTE',
};
const POS_SHORT: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP',
};
const ROLE_FILTERS = ['Fighter', 'Mage', 'Assassin', 'Marksman', 'Tank', 'Support'] as const;
type RoleFilter = typeof ROLE_FILTERS[number] | '';
const ROLE_ES: Record<string, string> = {
  Fighter: 'Luchador', Mage: 'Mago', Assassin: 'Asesino',
  Marksman: 'Tirador', Tank: 'Tanque', Support: 'Soporte',
};

// ── Presets de movimiento (mismo lenguaje que ChampSelectView) ──────────────
const xfade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.15, delay: 0.1, ease: EASE } },
};
const pop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE } },
};
const slideCol = (fromX: number) => ({
  hidden: { opacity: 0, x: fromX },
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE, staggerChildren: 0.07, delayChildren: 0.1 } },
});
const slideCard = (fromX: number) => ({
  hidden: { opacity: 0, x: fromX },
  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
});
const centerCol = {
  hidden: { opacity: 0, scale: 0.985 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } },
};
const title = {
  initial: { opacity: 0, letterSpacing: '0.42em', filter: 'blur(8px)' },
  animate: { opacity: 1, letterSpacing: '0.12em', filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE } },
};

/** Composición de un lado a partir de los tags DDragon de sus picks. */
function compOf(picks: (string | null)[], tagsByName: Map<string, string[]>) {
  const c = { AD: 0, AP: 0, TANK: 0, ENGAGE: 0 };
  for (const name of picks) {
    if (!name) continue;
    const tags = (tagsByName.get(name) || []).map((t) => t.toLowerCase());
    if (tags.includes('marksman') || tags.includes('fighter') || tags.includes('assassin')) c.AD++;
    if (tags.includes('mage')) c.AP++;
    if (tags.includes('tank')) c.TANK++;
    if (tags.includes('tank') || tags.includes('support') || tags.includes('fighter')) c.ENGAGE++;
  }
  return c;
}

const emptySlots = (): (string | null)[] => [null, null, null, null, null];

/**
 * Capa del dock que se muestra/oculta SIN desmontar (el DraftAiPanel guarda
 * su análisis y su debounce; desmontarlo al cambiar de pestaña lo reiniciaría).
 */
function Reveal({ on, children, style }: { on: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.div
      initial={false}
      animate={on ? { opacity: 1, y: 0, display: 'block' } : { opacity: 0, y: 8, transitionEnd: { display: 'none' } }}
      transition={{ duration: 0.25, ease: EASE }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export default function DraftView() {
  const patch = usePatch();

  const [bans, setBans] = useState<Record<Side, (string | null)[]>>({ blue: emptySlots(), red: emptySlots() });
  const [picks, setPicks] = useState<Record<Side, (string | null)[]>>({ blue: emptySlots(), red: emptySlots() });
  const [sel, setSel] = useState<Slot>({ side: 'blue', type: 'ban', idx: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');
  const [myPos, setMyPos] = useState<Position>('MIDDLE');
  const [sugs, setSugs] = useState<Array<{ name: string; winRate: number | null; matchupWinRate?: number | null; vsRival?: string; reason: string }>>([]);
  const [sugsLoading, setSugsLoading] = useState(false);
  // Slot azul marcado como "TÚ" a mano (null = automático por posición / primer pick).
  const [meIdx, setMeIdx] = useState<number | null>(null);
  const [dock, setDock] = useState<Dock>('sugs');
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [runesMsg, setRunesMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Lista de campeones del patch
  const champions = useMemo(() => {
    if (!patch) return [] as Array<{ name: string; tags: string[] }>;
    return Object.values(patch.byKey)
      .map((c: any) => ({ name: c.name as string, tags: (c.tags || []) as string[] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [patch]);

  const tagsByName = useMemo(() => {
    const m = new Map<string, string[]>();
    champions.forEach((c) => m.set(c.name, c.tags));
    return m;
  }, [champions]);

  const used = useMemo(() => {
    const s = new Set<string>();
    [...bans.blue, ...bans.red, ...picks.blue, ...picks.red].forEach((n) => { if (n) s.add(n); });
    return s;
  }, [bans, picks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return champions.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (roleFilter && !c.tags.includes(roleFilter)) return false;
      return true;
    });
  }, [champions, search, roleFilter]);

  // Avance del slot activo: siguiente hueco vacío del mismo lado (bans → picks)
  const advance = (from: Slot) => {
    const order: Slot[] = [];
    for (let i = 0; i < 5; i++) order.push({ side: from.side, type: 'ban', idx: i });
    for (let i = 0; i < 5; i++) order.push({ side: from.side, type: 'pick', idx: i });
    const flat = (s: Slot) => (s.type === 'ban' ? bans : picks)[s.side][s.idx];
    const start = order.findIndex((s) => s.type === from.type && s.idx === from.idx);
    for (let i = 1; i <= order.length; i++) {
      const cand = order[(start + i) % order.length];
      if (!flat(cand)) { setSel(cand); return; }
    }
  };

  const assign = (name: string) => {
    if (used.has(name)) return;
    const setter = sel.type === 'ban' ? setBans : setPicks;
    setter((prev) => {
      const next = { ...prev, [sel.side]: [...prev[sel.side]] };
      next[sel.side][sel.idx] = name;
      return next;
    });
    if (sel.type === 'pick') setLastPick(name);
    advance(sel);
  };

  const clearSlot = (slot: Slot) => {
    const setter = slot.type === 'ban' ? setBans : setPicks;
    setter((prev) => {
      const next = { ...prev, [slot.side]: [...prev[slot.side]] };
      next[slot.side][slot.idx] = null;
      return next;
    });
    setSel(slot);
  };

  const resetAll = () => {
    setBans({ blue: emptySlots(), red: emptySlots() });
    setPicks({ blue: emptySlots(), red: emptySlots() });
    setSel({ side: 'blue', type: 'ban', idx: 0 });
    setSugs([]);
    setMeIdx(null);
    setLastPick(null);
  };

  // Sugerencias: azul = tu lado; el enemigo son los picks rojos.
  const suggest = async () => {
    setSugsLoading(true);
    try {
      const compBlue = compOf(picks.blue, tagsByName);
      const missing: string[] = [];
      if (!compBlue.AD) missing.push('AD');
      if (!compBlue.AP) missing.push('AP');
      if (!compBlue.TANK) missing.push('TANK');
      if (!compBlue.ENGAGE) missing.push('ENGAGE');
      const list = await window.atak.opggPickSuggestions({
        position: myPos,
        missingRoles: missing,
        bannedNames: [...bans.blue, ...bans.red].filter(Boolean) as string[],
        pickedNames: [...picks.blue, ...picks.red].filter(Boolean) as string[],
        enemyNames: picks.red.filter(Boolean) as string[],
        rivalName: '',
        deep: true,
        limit: 6,
      });
      setSugs(Array.isArray(list) ? list : []);
    } catch {
      setSugs([]);
    } finally {
      setSugsLoading(false);
    }
  };

  // ── "Yo" en el lado azul y rival posicional ─────────────────────────────
  // Explícito (toggle TÚ) > slot que coincide con mi posición > primer pick azul.
  const meIndex = useMemo<number | null>(() => {
    if (meIdx != null) return meIdx;
    const posIdx = POSITIONS.indexOf(myPos);
    if (posIdx >= 0 && picks.blue[posIdx]) return posIdx;
    const first = picks.blue.findIndex(Boolean);
    return first >= 0 ? first : null;
  }, [meIdx, myPos, picks.blue]);
  const meName = meIndex != null ? picks.blue[meIndex] : null;
  const rivalName = meIndex != null ? picks.red[meIndex] : null;

  const aiRequest = useMemo<DraftAiRequest | null>(() => {
    if (meIndex == null || !meName) return null;
    const sideOf = (name: string, position?: string): DraftAiSide => ({
      championName: name,
      championId: patch?.keyByName[norm(name)],
      tags: tagsByName.get(name) || [],
      position,
    });
    return {
      me: sideOf(meName, myPos),
      position: myPos,
      allies: picks.blue.filter((n, i): n is string => Boolean(n) && i !== meIndex).map((n) => sideOf(n)),
      enemies: picks.red.filter((n): n is string => Boolean(n)).map((n) => sideOf(n)),
      rival: rivalName || undefined,
      mode: 'ranked',
    };
  }, [meIndex, meName, rivalName, myPos, picks, patch, tagsByName]);

  // Feedback breve al aplicar runas desde el coach.
  useEffect(() => {
    if (!runesMsg) return;
    const t = setTimeout(() => setRunesMsg(null), 4000);
    return () => clearTimeout(t);
  }, [runesMsg]);

  const isSel = (slot: Slot) => sel.side === slot.side && sel.type === slot.type && sel.idx === slot.idx;
  const bgName = meName || lastPick;
  const bgSplash = bgName ? champSplashUrl(patch, bgName) : null;
  const chapter = `${sel.side === 'blue' ? 'AZUL' : 'ROJO'} · ${sel.type === 'ban' ? 'BAN' : 'PICK'} ${sel.idx + 1}`;

  // OJO: BanBox / PickSlot / CompPills / SideColumn se declaran dentro del
  // render. Usados como <Componente/> React los remontaba en CADA render
  // (identidad nueva) y cualquier animación de entrada se re-disparaba al
  // teclear en el buscador. Por eso se invocan como funciones: mismo árbol.
  const BanBox = ({ slot }: { slot: Slot }) => {
    const name = bans[slot.side][slot.idx];
    const active = isSel(slot);
    const face = name ? champFaceUrl(patch, name) : null;
    return (
      <span
        key={`ban-${slot.idx}`}
        className={`hx-ban dv-ban cs-press no-drag${active ? ' is-acting' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setSel(slot)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(slot); } }}
        onContextMenu={(e) => { e.preventDefault(); if (name) clearSlot(slot); }}
        title={name ? `${name} · clic derecho para quitar` : `Ban ${slot.idx + 1} ${slot.side === 'blue' ? 'azul' : 'rojo'}`}
        style={{ opacity: name || active ? 1 : 0.6 }}
      >
        {name ? (
          <motion.span key={name} {...pop} style={{ display: 'block', width: '100%', height: '100%' }}>
            {face && <img src={face} alt={name} draggable={false} />}
            <motion.i initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: EASE, delay: 0.12 } }}>✕</motion.i>
          </motion.span>
        ) : (
          <span className="hx-ban-tag">B{slot.idx + 1}</span>
        )}
        {active && <span className="cs-acting-ring" aria-hidden />}
      </span>
    );
  };

  const PickSlot = ({ side, i }: { side: Side; i: number }) => {
    const slot: Slot = { side, type: 'pick', idx: i };
    const name = picks[side][i];
    const active = isSel(slot);
    const right = side === 'red';
    const isMe = side === 'blue' && meIndex === i;
    const isRival = side === 'red' && meIndex === i && Boolean(name);
    const face = name ? champFaceUrl(patch, name) : null;
    const art = name ? champSplashUrl(patch, name) : null;
    return (
      <motion.div
        key={`pick-${i}`}
        variants={slideCard(right ? 16 : -16)}
        className={`dv-pick${name ? '' : ' is-empty'}`}
        onContextMenu={(e) => { e.preventDefault(); if (name) clearSlot(slot); }}
      >
        <HxSlot
          side={right ? 'right' : 'left'}
          local={isMe}
          acting={active}
          rival={isRival}
          enemy={right}
          art={art}
          onClick={() => setSel(slot)}
          title={name ? `${name} · clic derecho para quitar` : `Pick ${i + 1} ${right ? 'rojo' : 'azul'}`}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={name || 'empty'} {...xfade} style={{ display: 'inline-flex' }}>
              <HxHex src={face} size={38} tone={name ? (active ? 'cyan' : isMe ? 'crimson' : undefined) : 'dim'} letter={`${i + 1}`} />
            </motion.span>
          </AnimatePresence>
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <motion.div
              key={name || 'empty'}
              className={`hx-slot-name${name ? ' atak-link' : ''}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={name ? (e) => { e.stopPropagation(); openChampionPage(champSlug(patch, name)); } : undefined}
              title={name ? 'Ver campeón en ATAK.GG' : undefined}
            >
              {name || `PICK ${i + 1}`}
            </motion.div>
            <div className="hx-slot-sub" style={{ marginTop: 0 }}>
              {POS_SHORT[POSITIONS[i]]}{isMe ? ' · TÚ' : ''}{isRival ? ' · TU RIVAL' : ''}
            </div>
          </div>
          {side === 'blue' && (
            <button
              type="button"
              className={`dv-me no-drag${isMe ? ' on' : ''}`}
              title={meIdx === i ? 'Quitar la marca TÚ (vuelve a automático)' : 'Marcar este pick como tuyo para el coach IA'}
              onClick={(e) => { e.stopPropagation(); setMeIdx(meIdx === i ? null : i); }}
            >
              TÚ
            </button>
          )}
        </HxSlot>
      </motion.div>
    );
  };

  const CompPills = ({ side }: { side: Side }) => {
    const c = compOf(picks[side], tagsByName);
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: side === 'red' ? 'flex-end' : 'flex-start' }}>
        {(['AD', 'AP', 'TANK', 'ENGAGE'] as const).map((k) => (
          <span key={k} className={`hx-pill${c[k] > 0 ? ' ok' : ' miss'}`} style={{ fontSize: 9, padding: '1px 6px' }}>
            {k}<span className="n">{c[k]}</span>
          </span>
        ))}
      </div>
    );
  };

  const SideColumn = ({ side }: { side: Side }) => {
    const right = side === 'red';
    const fromX = right ? 16 : -16;
    return (
      <motion.aside key={side} className="dv-col" variants={slideCol(right ? 32 : -32)}>
        <motion.div variants={slideCard(fromX)} className={`dv-col-head ${side}${right ? ' right' : ''}`}>
          <span className="gem" />
          <span className={`hx-label ${side}`}>{right ? 'Lado rojo' : 'Lado azul · tú'}</span>
        </motion.div>
        <motion.div variants={slideCard(fromX)} className={`dv-bans${right ? ' right' : ''}`}>
          {[0, 1, 2, 3, 4].map((i) => BanBox({ slot: { side, type: 'ban', idx: i } }))}
        </motion.div>
        {[0, 1, 2, 3, 4].map((i) => PickSlot({ side, i }))}
        <motion.div variants={slideCard(fromX)} style={{ marginTop: 'auto' }}>
          <HxPanel cut={6} inner={{ padding: '7px 10px' }}>
            <div className="hx-label" style={{ marginBottom: 4, textAlign: right ? 'right' : 'left' }}>Composición</div>
            {CompPills({ side })}
          </HxPanel>
        </motion.div>
      </motion.aside>
    );
  };

  return (
    <motion.div
      className="hx dv-root"
      variants={staggerParent(0.04, 0.04)}
      initial="hidden"
      animate="show"
    >
      {/* Fondo: splash de tu pick (o el último) con Ken Burns + crossfade */}
      <AnimatePresence>
        {bgSplash && (
          <motion.div key={bgSplash} {...xfade} className="dv-bg">
            <motion.img src={bgSplash} alt="" initial={{ scale: 1.14 }} animate={{ scale: 1.06 }} transition={{ duration: 14, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {SideColumn({ side: 'blue' })}

      {/* Centro: rótulo del slot activo + buscador/filtro + grid + dock */}
      <motion.section className="dv-col center" variants={centerCol}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
          {/* Rótulo del slot activo: re-entra con el preset `title` en cada cambio (sin exit: nunca se queda colgado si el usuario encadena clics). */}
          <motion.div key={chapter} initial={title.initial} animate={title.animate} className="hx-chrome dv-chapter">{chapter}</motion.div>
          <span className="hx-faint" style={{ fontSize: 10, letterSpacing: '0.06em' }}>clic en un slot lo activa · clic derecho lo limpia</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="hx-btn ghost no-drag" style={{ minHeight: 28, padding: '0 10px', fontSize: 10 }} onClick={resetAll}>Reiniciar</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="dv-input no-drag"
            placeholder="Buscar campeón…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar campeón"
          />
          <HxSegmented<RoleFilter>
            className="dv-seg no-drag"
            value={roleFilter}
            onChange={(v) => setRoleFilter(roleFilter === v ? '' : v)}
            options={[{ id: '', label: 'Todos' }, ...ROLE_FILTERS.map((r) => ({ id: r, label: ROLE_ES[r] }))]}
          />
        </div>

        {/* Grid de campeones */}
        <div className="dv-grid-wrap">
          <div className="dv-grid">
            {visible.map((c) => {
              const taken = used.has(c.name);
              const face = champFaceUrl(patch, c.name);
              return (
                <div
                  key={c.name}
                  className={`no-drag cs-grid-cell dv-cell${taken ? ' taken' : ''}`}
                  title={taken ? `${c.name} (ya usado)` : c.name}
                  onClick={() => assign(c.name)}
                >
                  {face ? <img src={face} alt={c.name} draggable={false} loading="lazy" /> : <span className="ph">{c.name.charAt(0)}</span>}
                </div>
              );
            })}
            {!visible.length && (
              <span className="hx-muted" style={{ gridColumn: '1/-1', fontSize: 12, padding: 12, textAlign: 'center' }}>
                {patch ? 'Sin resultados' : 'Cargando campeones…'}
              </span>
            )}
          </div>
        </div>

        {/* Dock: sugerencias OP.GG | ATAK Coach (IA). Ambos quedan montados. */}
        <div className={`dv-dock${dock === 'coach' ? ' coach' : ''}`}>
          <HxTabs<Dock>
            className="dv-dock-tabs no-drag"
            value={dock}
            onChange={setDock}
            options={[{ id: 'sugs', label: 'Sugerencias' }, { id: 'coach', label: 'ATAK Coach' }]}
          />
          <div className="dv-dock-body">
            <Reveal on={dock === 'sugs'}>
              <HxPanel corners inner={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="hx-label gold">Sugerencias para el azul</span>
                  <HxSegmented<Position>
                    className="dv-seg no-drag"
                    value={myPos}
                    onChange={setMyPos}
                    options={POSITIONS.map((p) => ({ id: p, label: POS_LABEL[p] }))}
                  />
                  <button
                    type="button"
                    className="hx-btn primary no-drag"
                    style={{ minHeight: 30, padding: '0 14px', fontSize: 11, marginLeft: 'auto' }}
                    onClick={() => void suggest()}
                    disabled={sugsLoading}
                  >
                    {sugsLoading ? 'Analizando…' : 'Sugerir pick'}
                  </button>
                </div>
                {/* vacío ↔ lista con relevo; la lista entra escalonada cuando cambia su identidad. */}
                <AnimatePresence mode="wait" initial={false}>
                  {sugs.length > 0 ? (
                    <motion.div
                      key={sugs.map((s) => s.name).join('|')}
                      variants={staggerParent(0.04)}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE } }}
                      style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                    >
                      {sugs.map((s) => (
                        <motion.div
                          key={s.name}
                          variants={rise}
                          whileTap={{ scale: 0.96, transition: { duration: 0.15, ease: 'easeOut' } }}
                          className="dv-sug no-drag"
                          title={`${s.reason ? `${s.reason} · ` : ''}clic para ponerlo en el slot activo`}
                          onClick={() => assign(s.name)}
                        >
                          <HxHex src={champFaceUrl(patch, s.name)} size={44} tone={s.matchupWinRate != null ? 'cyan' : undefined} letter={s.name.charAt(0)} />
                          <div className="nm">{s.name}</div>
                          <div className="hx-mono" style={{ fontSize: 9, color: s.matchupWinRate != null ? '#8fd99e' : 'var(--hx-muted)' }}>
                            {s.matchupWinRate != null ? `${s.matchupWinRate}% vs ${s.vsRival}` : s.winRate != null ? `${s.winRate}% WR` : '—'}
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div key="hint" {...swap} className="hx-muted" style={{ fontSize: 11 }}>
                      Llena bans y picks del rojo, elige tu línea y presiona SUGERIR PICK — puntúa el meta contra el draft enemigo real (OP.GG).
                    </motion.div>
                  )}
                </AnimatePresence>
              </HxPanel>
            </Reveal>

            <Reveal on={dock === 'coach'}>
              <DraftAiPanel
                patch={patch}
                request={aiRequest}
                enabled={dock === 'coach'}
                compact
                onRunesApplied={(r) => setRunesMsg(r.ok ? { ok: true, text: 'Runas IA aplicadas en el cliente.' } : { ok: false, text: `No se pudieron aplicar las runas${r.error ? `: ${r.error}` : ''}.` })}
              />
              <AnimatePresence>
                {runesMsg && (
                  <motion.div key={runesMsg.text} {...swap} className={`hx-label ${runesMsg.ok ? 'cyan' : 'red'}`} style={{ marginTop: 6, textTransform: 'none', letterSpacing: '0.06em' }}>
                    {runesMsg.text}
                  </motion.div>
                )}
              </AnimatePresence>
              {aiRequest && (
                <div className="hx-faint" style={{ fontSize: 10, marginTop: 6, letterSpacing: '0.04em' }}>
                  Tú: <b style={{ color: 'var(--hx-gold-bright)', fontWeight: 600 }}>{aiRequest.me.championName}</b> ({POS_LABEL[myPos]})
                  {rivalName ? <> · rival posicional: <b style={{ color: '#ff9aa0', fontWeight: 600 }}>{rivalName}</b></> : ' · sin rival en el slot espejo'}
                  {' · '}marca otro pick con <b style={{ fontWeight: 600 }}>TÚ</b> para cambiarlo.
                </div>
              )}
            </Reveal>
          </div>
        </div>
      </motion.section>

      {SideColumn({ side: 'red' })}
    </motion.div>
  );
}
