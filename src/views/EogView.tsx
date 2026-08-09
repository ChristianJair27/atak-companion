// src/views/EogView.tsx — Post-partida 960×660 (diseño 1d).
// El payload eog-stats-block varía entre versiones del cliente: se lee TODO con
// st(obj, ...variantes) y se renderiza solo lo que exista.
import { useEffect, useState } from 'react';
import { ChampIcon, fmtClock, fmtK, modeEs, usePatch, type PatchInfo } from './shared';

/** Lector tolerante: prueba cada clave en el objeto y en su .stats. */
const st = (o: any, ...keys: string[]): any => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
    if (o.stats && typeof o.stats === 'object' && o.stats[k] !== undefined) return o.stats[k];
  }
  return undefined;
};

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Row {
  isLocal: boolean;
  champ: string;
  name: string;
  k: number; d: number; a: number;
  cs: number;
  dmg: number;
  gold: number;
  vision: number;
}

function readPlayer(p: any, patch: PatchInfo | null, localKey: string): Row {
  const champId = num(st(p, 'championId', 'CHAMPION_ID'));
  const champ =
    String(st(p, 'championName') ?? '') || patch?.byKey[champId]?.name || '';
  const gameName = st(p, 'riotIdGameName', 'gameName');
  const name = String(gameName ?? st(p, 'summonerName', 'SUMMONER_NAME') ?? '') || champ;
  const puuid = String(st(p, 'puuid') ?? '');
  const isLocal = Boolean(localKey) && (puuid === localKey || name === localKey);
  const minions = num(st(p, 'MINIONS_KILLED', 'minionsKilled', 'totalMinionsKilled'));
  const neutral = num(st(p, 'NEUTRAL_MINIONS_KILLED', 'neutralMinionsKilled'));
  return {
    isLocal,
    champ,
    name,
    k: num(st(p, 'CHAMPIONS_KILLED', 'championsKilled', 'kills')),
    d: num(st(p, 'NUM_DEATHS', 'numDeaths', 'deaths')),
    a: num(st(p, 'ASSISTS', 'assists')),
    cs: minions + neutral,
    dmg: num(st(p, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS', 'totalDamageDealtToChampions')),
    gold: num(st(p, 'GOLD_EARNED', 'goldEarned', 'gold')),
    vision: num(st(p, 'VISION_SCORE', 'visionScore', 'wardScore')),
  };
}

const grade = (kdaRatio: number): string =>
  kdaRatio >= 5 ? 'S' : kdaRatio >= 3.5 ? 'A' : kdaRatio >= 2.5 ? 'B' : kdaRatio >= 1.5 ? 'C' : 'D';

export default function EogView() {
  const [eog, setEog] = useState<any>(null);
  const patch = usePatch();
  useEffect(() => window.atak.onEogData(setEog), []);

  if (!eog) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0A0A0C', border: '1px solid rgba(200,205,214,.18)', display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" />
          <span className="label">CARGANDO ESTADÍSTICAS…</span>
        </div>
      </div>
    );
  }

  // ── Interpretación tolerante del bloque EOG ──
  const teams: any[] = Array.isArray(eog.teams) ? eog.teams : [];
  const local = eog.localPlayer || null;
  const localKey = String(st(local, 'puuid') ?? st(local, 'riotIdGameName', 'gameName') ?? st(local, 'summonerName') ?? '');

  const myTeam =
    teams.find((t) => st(t, 'isPlayerTeam') === true) ||
    teams.find((t) => (t.players || []).some((p: any) =>
      (String(st(p, 'puuid') ?? '') && String(st(p, 'puuid')) === String(st(local, 'puuid') ?? '__')) ||
      (localKey && String(st(p, 'riotIdGameName', 'gameName') ?? st(p, 'summonerName') ?? '') === localKey),
    )) ||
    teams[0] ||
    null;

  const winRaw = myTeam ? st(myTeam, 'isWinningTeam', 'isWinner', 'won', 'win') : st(local, 'WIN', 'win');
  const won = winRaw === true || winRaw === 1 || winRaw === 'Win' || winRaw === 'WIN';
  const resultado = winRaw === undefined ? 'PARTIDA FINALIZADA' : won ? 'VICTORIA' : 'DERROTA';

  const rows: Row[] = ((myTeam?.players as any[]) || []).map((p) => readPlayer(p, patch, localKey));
  const meRow = rows.find((r) => r.isLocal) || (local ? readPlayer(local, patch, localKey) : null);
  const maxDmg = Math.max(1, ...rows.map((r) => r.dmg));

  const lenRaw = num(st(eog, 'gameLength', 'gameDuration', 'gameLengthSeconds'));
  const lenSecs = lenRaw > 10000 ? Math.round(lenRaw / 1000) : lenRaw;
  const kdaRatio = meRow ? (meRow.d > 0 ? (meRow.k + meRow.a) / meRow.d : meRow.k + meRow.a) : 0;
  const teamKills = rows.reduce((acc, r) => acc + r.k, 0);
  const part = meRow && teamKills > 0 ? Math.round(((meRow.k + meRow.a) / teamKills) * 100) : null;
  const csMin = meRow && lenSecs > 0 ? (meRow.cs / (lenSecs / 60)).toFixed(1) : null;

  const badges: Array<{ txt: string; cls: string }> = [];
  if (meRow) {
    if (rows.length > 1 && meRow.dmg >= maxDmg) badges.push({ txt: 'CARRY DE DAÑO', cls: 'badge-red' });
    const multi = num(st(local, 'LARGEST_MULTI_KILL', 'largestMultiKill'));
    if (multi >= 5) badges.push({ txt: 'PENTA KILL', cls: 'badge-red badge-glow' });
    else if (multi === 4) badges.push({ txt: 'QUADRA KILL', cls: 'badge-red badge-glow' });
    if (rows.length > 1 && meRow.vision > 0 && meRow.vision >= Math.max(...rows.map((r) => r.vision))) badges.push({ txt: 'VISIÓN DOMINANTE', cls: 'badge-silver' });
    if (num(st(local, 'FIRST_BLOOD', 'firstBloodKill')) > 0) badges.push({ txt: 'PRIMERA SANGRE', cls: 'badge-outline' });
  }

  const openAnalysis = () => {
    window.atak.status()
      .then((s: any) => { if (s?.frontend) window.atak.openExternal(String(s.frontend)); })
      .catch(() => {});
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0C', border: '1px solid rgba(200,205,214,.18)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 220, background: 'radial-gradient(70% 130% at 50% 0%,rgba(225,36,46,.16),transparent 70%)', pointerEvents: 'none' }} />
      <button
        className="tb-btn close no-drag"
        onClick={() => window.atak.win('close')}
        style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 34, zIndex: 2 }}
        aria-label="Cerrar"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>

      {/* Banner */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0 18px' }}>
        <div
          className="display"
          style={{
            fontWeight: 800, fontSize: 58, letterSpacing: '0.22em', lineHeight: 1, textIndent: '0.22em',
            background: won
              ? 'linear-gradient(180deg,#fff 0%,#d7dae1 40%,#8b8f9a 70%,#c9cdd6 100%)'
              : 'linear-gradient(180deg,#ff9aa0 0%,#E1242E 55%,#7d1017 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}
        >
          {resultado}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, width: 520 }}>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,transparent,#E1242E)' }} />
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0 L9 5 L14 7 L9 9 L7 14 L5 9 L0 7 L5 5 Z" fill="#E1242E" /></svg>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,#E1242E,transparent)' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, letterSpacing: '0.18em', color: 'var(--text-dim)' }}>
          {[modeEs(String(st(eog, 'gameMode') ?? '')), lenSecs > 0 ? fmtClock(lenSecs) : null].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Grado + stats personales */}
      {meRow && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 26, padding: '4px 40px 16px' }}>
          <div style={{ width: 96, height: 96, flex: 'none', borderRadius: '50%', background: 'conic-gradient(from 210deg,#f5f6f8,#7d828e 25%,#d7dae1 50%,#6f7480 75%,#f5f6f8)', display: 'grid', placeItems: 'center', boxShadow: '0 0 22px rgba(225,36,46,.35)' }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#26060a,#0f0507)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 16px rgba(225,36,46,.4)' }}>
              <span className="metal-text-bright" style={{ fontWeight: 800, fontSize: 44 }}>{grade(kdaRatio)}</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span className="display" style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{meRow.champ || meRow.name}</span>
              <span className="display" style={{ fontWeight: 800, fontSize: 26, letterSpacing: '0.06em' }}>{meRow.k} / {meRow.d} / {meRow.a}</span>
              <span style={{ fontSize: 12, color: 'var(--crimson)', fontWeight: 600 }}>KDA {kdaRatio.toFixed(1)}</span>
            </div>
            {badges.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {badges.map((b, i) => <span key={i} className={`badge skew ${b.cls}`} style={{ '--skew': '7px' } as any}>{b.txt}</span>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 26, marginTop: 10 }}>
              <div><div style={{ font: '600 16px var(--font-data)' }}>{fmtK(meRow.dmg)}</div><div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>DAÑO</div></div>
              <div><div style={{ font: '600 16px var(--font-data)' }}>{meRow.cs}</div><div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>{csMin ? `CS · ${csMin}/MIN` : 'CS'}</div></div>
              <div><div style={{ font: '600 16px var(--font-data)' }}>{fmtK(meRow.gold)}</div><div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>ORO</div></div>
              <div><div style={{ font: '600 16px var(--font-data)' }}>{meRow.vision}</div><div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>VISIÓN</div></div>
              {part != null && (
                <div><div style={{ font: '600 16px var(--font-data)', color: 'var(--crimson)' }}>{part}%</div><div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>PARTICIPACIÓN</div></div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="hr" style={{ margin: '0 40px' }} />

      {/* Tabla del equipo con barras de daño */}
      <div style={{ flex: 1, padding: '12px 40px 16px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflow: 'hidden auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 150px 70px 46px 1fr 60px', gap: 10, fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-faint)', padding: '0 4px' }}>
          <span /><span>JUGADOR</span><span style={{ textAlign: 'center' }}>KDA</span><span style={{ textAlign: 'right' }}>CS</span><span>DAÑO INFLIGIDO</span><span style={{ textAlign: 'right' }}>ORO</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'grid', gridTemplateColumns: '28px 150px 70px 46px 1fr 60px', gap: 10, alignItems: 'center',
              background: r.isLocal ? 'rgba(225,36,46,.08)' : 'rgba(255,255,255,.03)',
              borderLeft: `2px solid ${r.isLocal ? 'var(--crimson)' : 'var(--metal-dark)'}`,
              padding: '5px 6px',
            }}
          >
            <ChampIcon patch={patch} name={r.champ} size={24} />
            <span style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ font: '600 12px var(--font-data)', textAlign: 'center', color: 'var(--text-soft)' }}>{r.k}/{r.d}/{r.a}</span>
            <span style={{ font: '500 12px var(--font-data)', textAlign: 'right', color: 'var(--text-dim)' }}>{r.cs}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="dmg-bar" style={{ width: `${Math.round((r.dmg / maxDmg) * 100)}%`, minWidth: 2 }} />
              <span style={{ font: '500 11px var(--font-data)', color: 'var(--text-soft)', flex: 'none' }}>{fmtK(r.dmg)}</span>
            </span>
            <span style={{ font: '500 12px var(--font-data)', textAlign: 'right', color: 'var(--text-dim)' }}>{fmtK(r.gold)}</span>
          </div>
        ))}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
          <button className="btn btn-ghost skew" style={{ '--skew': '9px' } as any} onClick={openAnalysis}>ANÁLISIS COMPLETO</button>
          <button className="btn btn-primary skew" style={{ '--skew': '9px' } as any} onClick={() => window.atak.win('close')}>SIGUIENTE PARTIDA</button>
        </div>
      </div>
    </div>
  );
}
