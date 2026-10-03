// src/views/HudView.tsx — HUD in-game compacto (ventana 320×420, F9).
// Overlay siempre visible encima del juego: poca información para no estorbar,
// y los números clave como gráficos de progreso (anillos CS/MIN · KP · VISIÓN,
// barra de oro hacia el siguiente item core de OP.GG). Piel hextech.
// Listas de equipos y grilla AD/AP/ARM/RM viven en el scoreboard (Ctrl+Shift+S).
import { useEffect, useState, type ReactNode } from 'react';
import { BarFill, Blip, Rise, Stagger, Ticker } from '../motion';
import { champFaceUrl, HxHex, HxItem, HxPanel, HxRing, useItemData, type ItemInfo } from './hextech';
import { fmtClock, useLive, usePatch } from './shared';
import './hud.css';

// ── Build OP.GG: una llamada por campeón (caché de módulo) ───────────────────
interface Build { core_item_ids?: number[]; boots_id?: number; starter_ids?: number[]; full_builds?: Array<{ ids: number[] }> }
const buildCache = new Map<string, Promise<Build | null>>();

function useBuild(championName: string | undefined, position: string): Build | null {
  const [build, setBuild] = useState<Build | null>(null);
  useEffect(() => {
    if (!championName) { setBuild(null); return; }
    let alive = true;
    if (!buildCache.has(championName)) {
      buildCache.set(
        championName,
        window.atak.opggBuild(championName, position || 'MIDDLE')
          .then((b: any) => (b && typeof b === 'object' ? (b as Build) : null))
          .catch(() => null)
          .then((b) => { if (!b) buildCache.delete(championName); return b; }),
      );
    }
    setBuild(null);
    buildCache.get(championName)!.then((b) => { if (alive) setBuild(b); });
    return () => { alive = false; };
    // La posición solo importa en la primera llamada de ese campeón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [championName]);
  return build;
}

// ── Siguiente item core y oro que falta ──────────────────────────────────────
type NextItem =
  | { status: 'loading' }
  | { status: 'done' }
  | { status: 'item'; id: number; name: string; cost: number };

const BOOTS_BASE = 1001;

function computeNextItem(build: Build | null, owned: number[], items: Record<number, ItemInfo> | null): NextItem {
  if (!build || !items) return { status: 'loading' };
  // Plan = build completa más jugada (core → botas → 4º/5º/6º); si no hay, core + botas.
  const full = build.full_builds?.[0]?.ids || [];
  const plan = (full.length
    ? [...full.filter((id) => id !== build.boots_id), ...(build.boots_id ? [build.boots_id] : [])]
    : [...(build.core_item_ids || []), ...(build.boots_id ? [build.boots_id] : [])]
  ).filter((id) => id > 0);
  if (!plan.length) return { status: 'done' };
  const ownedSet = new Set(owned);
  const hasBoots = owned.some((id) => id === BOOTS_BASE || (items[id]?.from || []).includes(BOOTS_BASE));
  const target = plan.find((id) => !ownedSet.has(id) && !(id === build.boots_id && hasBoots));
  if (target == null) return { status: 'done' };
  const info = items[target];
  if (!info) return { status: 'item', id: target, name: '', cost: 0 };
  // Crédito por componentes ya comprados: cada item del inventario se cuenta
  // una sola vez; si falta un componente directo, se buscan sus subcomponentes.
  const pool = [...owned];
  const credit = (id: number): number => {
    const i = pool.indexOf(id);
    if (i >= 0) { pool.splice(i, 1); return items[id]?.gold || 0; }
    return (items[id]?.from || []).reduce((s, c) => s + credit(c), 0);
  };
  const paid = (info.from || []).reduce((s, c) => s + credit(c), 0);
  return { status: 'item', id: target, name: info.name, cost: Math.max(0, info.gold - paid) };
}

// ── Pill de objetivo ─────────────────────────────────────────────────────────
function ObjPill({ label, nextAt, alive, t }: { label: string; nextAt: number | null; alive: boolean; t: number }) {
  const gone = nextAt == null;
  const live = alive && !gone;
  return (
    <span className={`hud-pill${live ? ' live' : ''}${gone ? ' off' : ''}`}>
      <span className="k">{label}</span>
      <span className="v hx-mono">{gone ? '—' : live ? 'VIVO' : fmtClock(nextAt - t)}</span>
    </span>
  );
}

const fmt1 = (n: number) => n.toFixed(1);

export default function HudView() {
  const live = useLive();
  const patch = usePatch();
  const items = useItemData(patch);
  const s = live?.state;
  const o = live?.objectives;
  const me = s?.me;
  const mePlayer = (s?.players || []).find((p: any) => p.isMe) || null;
  const build = useBuild(me?.championName || undefined, mePlayer?.position || 'MIDDLE');

  if (!s || !me) {
    return (
      <div className="hx hud-root">
        <HxPanel className="hud-wait" cut={8} inner={{ padding: '7px 12px' }}>
          <span className="hx-label">{s ? 'SIN JUGADOR LOCAL' : 'ESPERANDO PARTIDA…'}</span>
        </HxPanel>
      </div>
    );
  }

  const gameTime: number = Number(s.gameTime) || 0;
  const min = gameTime / 60;
  const cs = Number(me.creepScore) || 0;
  const vision = Number(me.visionScore) || 0;
  const kp = Math.max(0, Math.min(100, Number(me.killParticipation) || 0));
  const gold = Number(me.gold) || 0;
  const csMin = min > 0 ? cs / min : 0;
  const visMin = min > 0 ? vision / min : 0;
  const kda = me.deaths > 0 ? (me.kills + me.assists) / me.deaths : me.kills + me.assists;
  // Antes del minuto y medio no hay CS que juzgar: dorado neutro.
  const csColor = gameTime < 90 ? 'var(--hx-gold)' : csMin >= 7 ? 'var(--hx-green)' : csMin >= 5 ? 'var(--hx-gold)' : 'var(--hx-crimson)';

  const cst = me.championStats;
  const hpPct = cst?.maxHp > 0 ? Math.max(0, Math.min(100, (cst.hp / cst.maxHp) * 100)) : 0;
  const resPct = cst?.maxResource > 0 ? Math.max(0, Math.min(100, (cst.resource / cst.maxResource) * 100)) : null;
  const resType = String(cst?.resourceType || 'MANA').toUpperCase();
  const resCls = resType === 'MANA' ? 'mana' : resType === 'ENERGY' ? 'energy' : 'other';

  const owned: number[] = Array.isArray(mePlayer?.items) ? mePlayer.items : [];
  const next = computeNextItem(build, owned, items);
  const ready = next.status === 'item' && gold >= next.cost;
  const nextPct = next.status === 'item' ? (next.cost > 0 ? (gold / next.cost) * 100 : 100) : 0;

  let nextBody: ReactNode;
  if (next.status === 'loading') nextBody = <div className="hud-next-muted">Buscando build…</div>;
  else if (next.status === 'done') nextBody = <div className="hud-next-muted">Build completa</div>;
  else {
    nextBody = (
      <div className="hud-next-row">
        <HxItem patch={patch} id={next.id} size={32} core title={next.name} />
        <div className="hud-next-body">
          <div className="hud-next-head">
            <span className="hud-next-name">{next.name || `Item ${next.id}`}</span>
            <span className={`hud-next-need${ready ? ' ok' : ''}`}>
              {ready ? '¡COMPRA!' : <>faltan <Ticker value={Math.max(0, next.cost - gold)} /></>}
            </span>
          </div>
          <div className="hx-bar-rail" style={{ height: 6 }}>
            <BarFill
              pct={nextPct}
              style={{
                background: ready ? 'linear-gradient(90deg, #2f8f3f, var(--hx-green))' : 'linear-gradient(90deg, #8a6d3b, var(--hx-gold) 70%, var(--hx-gold-bright))',
                boxShadow: ready ? '0 0 8px rgb(77 187 99 / 0.5)' : '0 0 8px rgb(200 170 110 / 0.4)',
              }}
            />
          </div>
          <div className="hud-next-foot hx-mono"><Ticker value={gold} /> / {next.cost}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hx hud-root">
      <Stagger>
        <HxPanel corners inner={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {/* Cabecera: retrato hex + nivel · nombre · reloj · HP / recurso */}
          <Rise className="hud-head">
            <div className="hud-face">
              <HxHex src={champFaceUrl(patch, me.championName)} size={44} tone="cyan" letter={(me.championName || '?').charAt(0)} />
              <span className="hud-lvl"><Blip value={me.level} /></span>
            </div>
            <div className="hud-id">
              <div className="hud-name-row">
                <span className="hx-display hud-name" title={me.championName}>{me.championName}</span>
                <span className="hx-mono hud-clock">{fmtClock(gameTime)}</span>
              </div>
              <div className={`hx-bar-rail hud-rail hp${hpPct <= 30 ? ' low' : ''}`} style={{ height: 5 }} title={cst ? `${cst.hp} / ${cst.maxHp}` : undefined}>
                <i style={{ width: `${hpPct}%` }} />
              </div>
              {resPct != null && (
                <div className={`hx-bar-rail hud-rail ${resCls}`} style={{ height: 3 }} title={`${cst.resource} / ${cst.maxResource}`}>
                  <i style={{ width: `${resPct}%` }} />
                </div>
              )}
            </div>
          </Rise>

          {/* KDA: cada número parpadea al cambiar */}
          <Rise className="hud-kda">
            <span className="hud-kda-n">
              <Blip className="hx-chrome" value={me.kills} />
              <span className="sep">/</span>
              <Blip className="hx-chrome" value={me.deaths} />
              <span className="sep">/</span>
              <Blip className="hx-chrome" value={me.assists} />
            </span>
            <span className="hud-kda-r">KDA <Ticker value={kda} format={fmt1} /></span>
          </Rise>

          {/* Anillos de progreso */}
          <Rise className="hud-rings">
            <HxRing pct={(csMin / 8) * 100} size={58} color={csColor} value={<Ticker value={csMin} format={fmt1} />} label="CS/MIN" />
            <HxRing pct={kp} size={58} color="var(--hx-cyan)" value={<><Ticker value={kp} />%</>} label="KP" />
            <HxRing pct={(visMin / 1.5) * 100} size={58} color="var(--hx-blue)" value={<Ticker value={vision} />} label="VISIÓN" />
          </Rise>

          <hr className="hx-hr" />

          {/* Siguiente item core (OP.GG) y oro que falta */}
          <Rise className="hud-next">
            <div className="hx-label gold">SIGUIENTE ITEM</div>
            {nextBody}
          </Rise>

          {/* Objetivos */}
          {o && (
            <Rise className="hud-objs">
              <ObjPill label="DRAGÓN" nextAt={o.dragon?.nextAt ?? null} alive={!!o.dragon?.alive} t={gameTime} />
              <ObjPill label="HERALDO" nextAt={o.herald?.nextAt ?? null} alive={!!o.herald?.alive} t={gameTime} />
              <ObjPill label="BARÓN" nextAt={o.baron?.nextAt ?? null} alive={!!o.baron?.alive} t={gameTime} />
            </Rise>
          )}
        </HxPanel>
      </Stagger>
    </div>
  );
}
