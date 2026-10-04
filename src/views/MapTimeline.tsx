// src/views/MapTimeline.tsx — Minimapa + eventos live (estilo MatchReplay2D de aka.gg).
// Sin Match-V5: usa eventos del Live Client (kills/objetivos) con coords si existen,
// o anclas de mapa razonables por tipo de evento.
import { useMemo, useState } from 'react';
import { fmtClock, type PatchInfo } from './shared';

const MAP_BOUNDS: Record<number, { maxX: number; maxY: number }> = {
  11: { maxX: 14870, maxY: 14980 }, // Grieta
  12: { maxX: 12849, maxY: 12858 }, // ARAM
};

// Anclas por tipo cuando no hay Position en el evento live.
const ANCHORS: Record<string, { x: number; y: number }> = {
  DragonKill: { x: 9866, y: 4414 },
  BaronKill: { x: 5007, y: 10471 },
  HeraldKill: { x: 5007, y: 10471 },
  TurretKilled: { x: 9810, y: 9500 },
  InhibKilled: { x: 11200, y: 11200 },
  ChampionKill: { x: 7500, y: 7500 },
};

const EVENT_META: Record<string, { icon: string; label: string; color: string }> = {
  ChampionKill: { icon: '⚔', label: 'Asesinato', color: '#e8323c' },
  DragonKill: { icon: '◆', label: 'Dragón', color: '#6db3ff' },
  BaronKill: { icon: '●', label: 'Barón', color: '#a78bfa' },
  HeraldKill: { icon: '◎', label: 'Heraldo', color: '#c8aa6e' },
  TurretKilled: { icon: '▲', label: 'Torre', color: '#b6b6c0' },
  InhibKilled: { icon: '■', label: 'Inhibidor', color: '#ff6b76' },
};

function eventPos(e: any): { x: number; y: number } | null {
  const p =
    e.Position || e.position || e.KillerPosition || e.VictimPosition || e.AssistersPosition;
  if (p && (p.x != null || p.X != null)) {
    return { x: Number(p.x ?? p.X), y: Number(p.y ?? p.Y) };
  }
  // Algunos clientes mandan campos planos
  if (e.x != null && e.y != null) return { x: Number(e.x), y: Number(e.y) };
  const a = ANCHORS[e.EventName];
  return a || null;
}

export default function MapTimeline(props: {
  events: any[];
  lenSecs: number;
  mapNumber?: number;
  patch?: PatchInfo | null;
}) {
  const { events, lenSecs, mapNumber = 11, patch } = props;
  const mapId = mapNumber === 12 ? 12 : 11;
  const bounds = MAP_BOUNDS[mapId];
  const [cursor, setCursor] = useState(1); // 0–1 scrub

  const all = useMemo(() => {
    const list = (events || [])
      .filter((e) =>
        ['ChampionKill', 'DragonKill', 'BaronKill', 'HeraldKill', 'TurretKilled', 'InhibKilled'].includes(
          e.EventName,
        ),
      )
      .map((e, i) => ({ ...e, _i: i, _pos: eventPos(e), t: Number(e.EventTime) || 0 }))
      .filter((e) => e._pos)
      .sort((a, b) => a.t - b.t);
    return list;
  }, [events]);

  const maxT = Math.max(lenSecs, all.length ? all[all.length - 1].t : 1, 1);
  const tNow = cursor * maxT;
  const visible = all.filter((e) => e.t <= tNow);
  const recent = visible.filter((e) => tNow - e.t < 45);
  const feed = visible.slice(-8).reverse();

  // Serie simple de kills por minuto (gráfico)
  const killSeries = useMemo(() => {
    const kills = all.filter((e) => e.EventName === 'ChampionKill');
    const bins = 12;
    const arr = new Array(bins).fill(0);
    for (const k of kills) {
      const bi = Math.min(bins - 1, Math.floor((k.t / maxT) * bins));
      arr[bi] += 1;
    }
    const peak = Math.max(1, ...arr);
    return arr.map((v) => v / peak);
  }, [all, maxT]);

  if (!all.length) {
    return (
      <div style={{ padding: 16, fontSize: 13, color: 'var(--text-dim)' }}>
        Sin eventos con posición. En partidas live los kills/objetivos se marcan en el mapa;
        para la repetición Match-V5 completa usa «Análisis completo» en ATAK.GG.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 14, minHeight: 0, height: '100%' }}>
      {/* Minimapa */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <div
          style={{
            position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12,
            overflow: 'hidden', background: '#0e0e11', border: '1px solid rgba(255,255,255,.09)',
          }}
        >
          <img
            src={`https://ddragon.leagueoflegends.com/cdn/6.8.1/img/map/map${mapId}.png`}
            alt=""
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }}
          />
          {recent.map((e, i) => {
            const meta = EVENT_META[e.EventName] || { icon: '•', label: e.EventName, color: '#fff' };
            const age = Math.min(1, (tNow - e.t) / 45);
            const left = ((e._pos!.x / bounds.maxX) * 100);
            const top = (1 - e._pos!.y / bounds.maxY) * 100;
            return (
              <div
                key={`${e.t}-${e._i}-${i}`}
                title={`${meta.label} · ${fmtClock(Math.round(e.t))}`}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: 'translate(-50%, -50%)',
                  width: e.EventName === 'ChampionKill' ? 18 : 16,
                  height: e.EventName === 'ChampionKill' ? 18 : 16,
                  borderRadius: '50%',
                  background: meta.color,
                  boxShadow: `0 0 10px ${meta.color}`,
                  opacity: 1 - age * 0.55,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 9,
                  color: '#0a0a0c',
                  fontWeight: 800,
                  zIndex: 3,
                  pointerEvents: 'none',
                }}
              >
                {meta.icon}
              </div>
            );
          })}
          {/* Scrub time badge */}
          <div
            className="mono"
            style={{
              position: 'absolute', left: 8, bottom: 8, zIndex: 4,
              background: 'rgba(10,10,12,.85)', border: '1px solid rgba(255,255,255,.14)',
              padding: '2px 8px', fontSize: 13, fontWeight: 700, color: '#fff', borderRadius: 4,
            }}
          >
            {fmtClock(Math.round(tNow))} / {fmtClock(Math.round(maxT))}
          </div>
        </div>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(cursor * 1000)}
          onChange={(ev) => setCursor(Number(ev.target.value) / 1000)}
          style={{ width: '100%', accentColor: '#e8323c' }}
        />

        {/* Gráfico kills por tramo */}
        <div>
          <div className="label" style={{ marginBottom: 4 }}>INTENSO DE KILLS</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
            {killSeries.map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${Math.max(8, v * 100)}%`,
                  background: '#e8323c',
                  opacity: 0.45 + v * 0.55,
                  borderRadius: '2px 2px 0 0',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Feed de eventos */}
      <div style={{ minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="label" style={{ marginBottom: 4 }}>EVENTOS · LIVE CLIENT</div>
        {feed.map((e, i) => {
          const meta = EVENT_META[e.EventName] || { icon: '•', label: e.EventName, color: '#9ba0ab' };
          return (
            <div
              key={i}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5,
                padding: '6px 8px', background: 'var(--ax-sub)', borderRadius: 4,
                borderLeft: `2px solid ${meta.color}`,
              }}
            >
              <span className="mono" style={{ width: 40, color: 'var(--text-dim)', flex: 'none' }}>
                {fmtClock(Math.round(e.t))}
              </span>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: meta.color,
                display: 'grid', placeItems: 'center', fontSize: 10, flex: 'none', color: '#0a0a0c', fontWeight: 800,
              }}>
                {meta.icon}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-soft)' }}>
                {e.EventName === 'ChampionKill'
                  ? `${e.KillerName || '?'} → ${e.VictimName || '?'}`
                  : `${meta.label}${e.DragonType ? ` · ${e.DragonType}` : ''}${e.KillerName ? ` · ${e.KillerName}` : ''}`}
              </span>
            </div>
          );
        })}
        {!feed.length && (
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Mueve el scrubber para ver eventos.</div>
        )}
      </div>
    </div>
  );
}
