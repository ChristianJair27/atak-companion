// src/views/DraftView.tsx — Herramienta de drafteo (pestaña de la main window).
// Simulador de draft: bans y picks de ambos lados, grid de campeones con
// búsqueda/filtro por rol, análisis de composición y sugerencias reales
// (winrate vs el draft enemigo) usando la misma tubería OP.GG del champ select.
import { useEffect, useMemo, useState } from 'react';
import { ChampIcon, champSlug, openChampionPage, usePatch } from './shared';

type Side = 'blue' | 'red';
type SlotType = 'pick' | 'ban';

interface Slot { side: Side; type: SlotType; idx: number }

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const POS_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JUNGLA', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SOPORTE',
};
const ROLE_FILTERS = ['Fighter', 'Mage', 'Assassin', 'Marksman', 'Tank', 'Support'] as const;
const ROLE_ES: Record<string, string> = {
  Fighter: 'Luchador', Mage: 'Mago', Assassin: 'Asesino',
  Marksman: 'Tirador', Tank: 'Tanque', Support: 'Soporte',
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

export default function DraftView() {
  const patch = usePatch();

  const [bans, setBans] = useState<Record<Side, (string | null)[]>>({ blue: emptySlots(), red: emptySlots() });
  const [picks, setPicks] = useState<Record<Side, (string | null)[]>>({ blue: emptySlots(), red: emptySlots() });
  const [sel, setSel] = useState<Slot>({ side: 'blue', type: 'ban', idx: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [myPos, setMyPos] = useState<string>('MIDDLE');
  const [sugs, setSugs] = useState<Array<{ name: string; winRate: number | null; matchupWinRate?: number | null; vsRival?: string; reason: string }>>([]);
  const [sugsLoading, setSugsLoading] = useState(false);

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

  const SlotBox = ({ slot, size }: { slot: Slot; size: number }) => {
    const name = (slot.type === 'ban' ? bans : picks)[slot.side][slot.idx];
    const active = sel.side === slot.side && sel.type === slot.type && sel.idx === slot.idx;
    const sideColor = slot.side === 'blue' ? '#6db3ff' : '#E1242E';
    return (
      <div
        className="no-drag"
        onClick={() => setSel(slot)}
        onContextMenu={(e) => { e.preventDefault(); if (name) clearSlot(slot); }}
        title={name ? `${name} · clic derecho para quitar` : `${slot.type === 'ban' ? 'Ban' : 'Pick'} ${slot.idx + 1} ${slot.side === 'blue' ? 'azul' : 'rojo'}`}
        style={{
          width: size, height: size, flex: 'none', cursor: 'pointer', position: 'relative',
          background: name ? 'transparent' : 'rgba(255,255,255,.04)',
          border: active ? `2px solid ${sideColor}` : '1px solid rgba(200,205,214,.18)',
          boxShadow: active ? `0 0 12px ${sideColor}66` : 'none',
          display: 'grid', placeItems: 'center',
          opacity: slot.type === 'ban' && name ? 0.75 : 1,
        }}
      >
        {name ? (
          <>
            <ChampIcon patch={patch} name={name} size={size - (active ? 4 : 2)} enemy={slot.side === 'red'} />
            {slot.type === 'ban' && (
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#E1242E', fontWeight: 900, fontSize: size * 0.5, background: 'rgba(0,0,0,.35)' }}>✕</span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{slot.type === 'ban' ? `B${slot.idx + 1}` : `P${slot.idx + 1}`}</span>
        )}
      </div>
    );
  };

  const CompChips = ({ side }: { side: Side }) => {
    const c = compOf(picks[side], tagsByName);
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['AD', 'AP', 'TANK', 'ENGAGE'] as const).map((k) => (
          <span key={k} className={`comp-chip${c[k] > 0 ? ' ok' : ' miss'}`} style={{ fontSize: 9, padding: '2px 6px' }}>
            {k}<span className="n">{c[k]}</span>
          </span>
        ))}
      </div>
    );
  };

  const SidePanel = ({ side }: { side: Side }) => (
    <div style={{
      width: 168, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10,
      padding: 12,
      background: side === 'blue' ? 'linear-gradient(180deg,rgba(109,179,255,.07),transparent)' : 'linear-gradient(180deg,rgba(225,36,46,.07),transparent)',
      border: `1px solid ${side === 'blue' ? 'rgba(109,179,255,.25)' : 'rgba(225,36,46,.25)'}`,
    }}>
      <div className="label" style={{ color: side === 'blue' ? '#6db3ff' : 'var(--crimson)', letterSpacing: '0.18em' }}>
        {side === 'blue' ? 'LADO AZUL (TÚ)' : 'LADO ROJO'}
      </div>
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 4 }}>BANS</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2, 3, 4].map((i) => <SlotBox key={i} slot={{ side, type: 'ban', idx: i }} size={27} />)}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 4 }}>PICKS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SlotBox slot={{ side, type: 'pick', idx: i }} size={44} />
              <span
                className={picks[side][i] ? 'atak-link no-drag' : undefined}
                onClick={() => picks[side][i] && openChampionPage(champSlug(patch, picks[side][i]))}
                title={picks[side][i] ? 'Ver campeón en ATAK.GG' : undefined}
                style={{ fontSize: 11.5, fontWeight: 600, color: picks[side][i] ? '#fff' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {picks[side][i] || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.14em', marginBottom: 4 }}>COMPOSICIÓN</div>
        <CompChips side={side} />
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
      <SidePanel side="blue" />

      {/* Centro: grid + sugerencias */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Controles */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input no-drag"
            placeholder="Buscar campeón…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 190 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                className="btn no-drag"
                style={{
                  fontSize: 10, padding: '5px 9px',
                  borderColor: roleFilter === r ? 'var(--crimson)' : undefined,
                  color: roleFilter === r ? '#fff' : undefined,
                }}
                onClick={() => setRoleFilter(roleFilter === r ? '' : r)}
              >
                {ROLE_ES[r]}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-dim)' }}>
            Slot activo: <b style={{ color: sel.side === 'blue' ? '#6db3ff' : 'var(--crimson)' }}>
              {sel.side === 'blue' ? 'AZUL' : 'ROJO'} {sel.type === 'ban' ? 'BAN' : 'PICK'} {sel.idx + 1}
            </b> · clic derecho en un slot lo limpia
          </span>
          <button className="btn no-drag" style={{ fontSize: 10, padding: '5px 10px' }} onClick={resetAll}>REINICIAR</button>
        </div>

        {/* Grid de campeones */}
        <div style={{ flex: 1, minHeight: 120, overflow: 'auto', border: '1px solid rgba(200,205,214,.14)', background: 'rgba(255,255,255,.02)', padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))', gap: 6 }}>
            {visible.map((c) => {
              const taken = used.has(c.name);
              return (
                <div
                  key={c.name}
                  className="no-drag"
                  title={taken ? `${c.name} (ya usado)` : c.name}
                  onClick={() => assign(c.name)}
                  style={{
                    cursor: taken ? 'not-allowed' : 'pointer',
                    opacity: taken ? 0.25 : 1,
                    filter: taken ? 'grayscale(1)' : 'none',
                    transition: 'transform .12s',
                  }}
                  onMouseEnter={(e) => { if (!taken) e.currentTarget.style.transform = 'scale(1.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                >
                  <ChampIcon patch={patch} name={c.name} size={44} />
                </div>
              );
            })}
            {!visible.length && (
              <span style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--text-faint)', padding: 12, textAlign: 'center' }}>
                {patch ? 'Sin resultados' : 'Cargando campeones…'}
              </span>
            )}
          </div>
        </div>

        {/* Sugerencias */}
        <div className="panel" style={{ padding: '10px 12px', background: 'rgba(10,10,14,.72)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="label" style={{ color: '#c8aa6e', letterSpacing: '0.16em' }}>SUGERENCIAS PARA EL AZUL</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  className="btn no-drag"
                  style={{
                    fontSize: 9.5, padding: '4px 8px',
                    borderColor: myPos === p ? '#c8aa6e' : undefined,
                    color: myPos === p ? '#c8aa6e' : undefined,
                  }}
                  onClick={() => setMyPos(p)}
                >
                  {POS_LABEL[p]}
                </button>
              ))}
            </div>
            <button className="btn btn-primary no-drag" style={{ fontSize: 10.5, padding: '5px 12px', marginLeft: 'auto' }} onClick={() => void suggest()} disabled={sugsLoading}>
              {sugsLoading ? 'ANALIZANDO…' : 'SUGERIR PICK'}
            </button>
          </div>
          {sugs.length > 0 ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {sugs.map((s) => (
                <div
                  key={s.name}
                  className="no-drag"
                  title={`${s.reason} · clic para ponerlo en el slot activo`}
                  onClick={() => assign(s.name)}
                  style={{ cursor: 'pointer', textAlign: 'center', width: 64 }}
                >
                  <ChampIcon patch={patch} name={s.name} size={44} />
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div className="mono" style={{ fontSize: 9, color: s.matchupWinRate != null ? '#8fd99e' : 'var(--text-dim)' }}>
                    {s.matchupWinRate != null ? `${s.matchupWinRate}% vs ${s.vsRival}` : s.winRate != null ? `${s.winRate}% WR` : '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
              Llena bans y picks del rojo, elige tu línea y presiona SUGERIR PICK — puntúa el meta contra el draft enemigo real (OP.GG).
            </div>
          )}
        </div>
      </div>

      <SidePanel side="red" />
    </div>
  );
}
