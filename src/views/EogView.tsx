// src/views/EogView.tsx — Post-partida visual (campeón 3D bailando, LP/rango,
// scoreboard, timeline con minimapa). Estética MatchDetail aka.gg + live client.
import { useEffect, useState } from 'react';
import {
  ChampIcon,
  DmgBar,
  ItemIcon,
  IconEye,
  IconGold,
  IconMinion,
  IconSword,
  RankBadge,
  champSplashUrl,
  fmtClock,
  fmtK,
  modeEs,
  usePatch,
  type PatchInfo,
} from './shared';
import ChampionDance from './ChampionDance';
import MapTimeline from './MapTimeline';
import EogRuneAnalysis, { readUsedRunes } from './EogRuneAnalysis';

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
  champId: number;
  name: string;
  k: number; d: number; a: number;
  cs: number;
  dmg: number;
  gold: number;
  vision: number;
  level: number;
  items: number[];
  multi: number;
  firstBlood: boolean;
  turrets: number;
  heal: number;
  raw: any;
}

function getItems(p: any): number[] {
  const s = p?.stats || p || {};
  const arr: number[] = [];
  for (let i = 0; i < 7; i++) {
    arr.push(num(s[`ITEM${i}`] ?? s[`item${i}`] ?? p?.[`ITEM${i}`]));
  }
  if (arr.every((id) => id === 0)) {
    const inv = p?.items || p?.inventory || s?.items;
    if (Array.isArray(inv)) {
      const mapped = inv.map((x: any) => (typeof x === 'number' ? x : num(x?.itemId ?? x?.itemID ?? x?.id)));
      while (mapped.length < 7) mapped.push(0);
      return mapped.slice(0, 7);
    }
  }
  return arr;
}

function playerName(p: any): string {
  if (!p) return '';
  const g = st(p, 'riotIdGameName', 'gameName');
  const t = st(p, 'riotIdTagLine', 'tagLine');
  if (g && t) return `${g}`;
  if (g) return String(g);
  return String(st(p, 'summonerName', 'SUMMONER_NAME', 'fullName') ?? '') || '';
}

function readPlayer(p: any, patch: PatchInfo | null, localKey: string): Row {
  const champId = num(st(p, 'championId', 'CHAMPION_ID'));
  const champ = String(st(p, 'championName') ?? '') || patch?.byKey[champId]?.name || '';
  const name = playerName(p) || champ;
  const puuid = String(st(p, 'puuid') ?? '');
  const isLocal = Boolean(localKey) && (puuid === localKey || name === localKey || playerName(p) === localKey);
  const minions = num(st(p, 'MINIONS_KILLED', 'minionsKilled', 'totalMinionsKilled'));
  const neutral = num(st(p, 'NEUTRAL_MINIONS_KILLED', 'neutralMinionsKilled'));
  return {
    isLocal,
    champ,
    champId,
    name,
    k: num(st(p, 'CHAMPIONS_KILLED', 'championsKilled', 'kills')),
    d: num(st(p, 'NUM_DEATHS', 'numDeaths', 'deaths')),
    a: num(st(p, 'ASSISTS', 'assists')),
    cs: minions + neutral,
    dmg: num(st(p, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS', 'totalDamageDealtToChampions')),
    gold: num(st(p, 'GOLD_EARNED', 'goldEarned', 'gold')),
    vision: num(st(p, 'VISION_SCORE', 'visionScore', 'wardScore')),
    level: num(st(p, 'LEVEL', 'level', 'champLevel')) || 1,
    items: getItems(p),
    multi: num(st(p, 'LARGEST_MULTI_KILL', 'largestMultiKill')),
    firstBlood: num(st(p, 'FIRST_BLOOD', 'FIRST_BLOOD_KILL', 'firstBloodKill')) > 0,
    turrets: num(st(p, 'TURRET_KILLS', 'turretKills', 'TURRETS_KILLED')),
    heal: num(st(p, 'TOTAL_HEAL', 'totalHeal', 'TOTAL_HEALING')),
    raw: p,
  };
}

const gradeOf = (kdaRatio: number, dmgShare: number, win: boolean): string => {
  let sc = 0;
  if (kdaRatio >= 6) sc += 34; else if (kdaRatio >= 4) sc += 26; else if (kdaRatio >= 2.5) sc += 17; else if (kdaRatio >= 1.5) sc += 8;
  if (dmgShare >= 0.28) sc += 28; else if (dmgShare >= 0.2) sc += 20; else if (dmgShare >= 0.13) sc += 12;
  if (win) sc += 16;
  return sc >= 88 ? 'S' : sc >= 70 ? 'A' : sc >= 52 ? 'B' : sc >= 32 ? 'C' : 'D';
};

function perfTags(r: Row, maxDmg: number, teamKills: number, dur: number): string[] {
  const tags: string[] = [];
  if (r.multi >= 5) return ['PENTA KILL'];
  if (r.multi >= 4) tags.push('QUADRA KILL');
  else if (r.multi >= 3) tags.push('TRIPLE KILL');
  if (r.d === 0 && dur > 900) tags.push('INMORTAL');
  else if (r.d >= 14) tags.push('SE RINDIÓ');
  const share = maxDmg > 0 ? r.dmg / maxDmg : 0;
  if (share >= 0.8) tags.push('CARRY DE DAÑO');
  else if (share <= 0.2 && dur > 1200) tags.push('POCO DAÑO');
  if (r.turrets >= 3) tags.push('DESTRUCTOR');
  if (r.vision >= 55) tags.push('BUENA VISIÓN');
  else if (r.vision < 8 && dur > 1200) tags.push('CIEGA');
  const csMin = dur > 0 ? r.cs / (dur / 60) : 0;
  if (csMin >= 8) tags.push('GRANJERO ELITE');
  else if (csMin < 2.5 && r.cs < 80 && dur > 1500) tags.push('DEJO DE FARMEAR');
  const kp = teamKills > 0 ? ((r.k + r.a) / teamKills) * 100 : 0;
  if (kp >= 70 && teamKills > 5) tags.push('SIEMPRE PRESENTE');
  if (r.firstBlood) tags.push('PRIMERA SANGRE');
  if (r.heal > 20000 && r.k <= 4) tags.push('ASISTENTE PRO');
  return tags.slice(0, 2);
}

export default function EogView() {
  const [eog, setEog] = useState<any>(null);
  const [tab, setTab] = useState<'board' | 'timeline' | 'analysis'>('board');
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

  const teams: any[] = Array.isArray(eog.teams) ? eog.teams : [];
  const local = eog.localPlayer || null;
  const localKey = String(
    st(local, 'puuid') ??
    st(local, 'riotIdGameName', 'gameName') ??
    st(local, 'summonerName') ??
    '',
  );

  const myTeamIdx = Math.max(0, teams.findIndex((t) =>
    st(t, 'isPlayerTeam') === true ||
    (t.players || []).some((p: any) => {
      const n = playerName(p);
      const pu = String(st(p, 'puuid') ?? '');
      return (pu && pu === String(st(local, 'puuid') ?? '__')) || (localKey && (n === localKey || pu === localKey));
    }),
  ));
  const myTeam = teams[myTeamIdx] || teams[0] || null;
  const enemyTeam = teams.find((_, i) => i !== myTeamIdx) || teams[1] || null;

  const winRaw = myTeam ? st(myTeam, 'isWinningTeam', 'isWinner', 'won', 'win') : st(local, 'WIN', 'win');
  const won = winRaw === true || winRaw === 1 || winRaw === 'Win' || winRaw === 'WIN';
  const resultado = winRaw === undefined ? 'PARTIDA FINALIZADA' : won ? 'VICTORIA' : 'DERROTA';

  const allyRows: Row[] = ((myTeam?.players as any[]) || []).map((p) => readPlayer(p, patch, localKey));
  const enemyRows: Row[] = ((enemyTeam?.players as any[]) || []).map((p) => readPlayer(p, patch, localKey));
  const allRows = [...allyRows, ...enemyRows];
  const meRow = allyRows.find((r) => r.isLocal) || (local ? readPlayer(local, patch, localKey) : null);
  const maxDmg = Math.max(1, ...allRows.map((r) => r.dmg), meRow?.dmg || 0);

  const lenRaw = num(st(eog, 'gameLength', 'gameDuration', 'gameLengthSeconds'));
  const lenSecs = lenRaw > 10000 ? Math.round(lenRaw / 1000) : lenRaw;
  const isRemake = lenSecs > 0 && lenSecs < 180;
  const kdaRatio = meRow ? (meRow.d > 0 ? (meRow.k + meRow.a) / meRow.d : meRow.k + meRow.a) : 0;
  const teamKills = allyRows.reduce((acc, r) => acc + r.k, 0);
  const part = meRow && teamKills > 0 ? Math.round(((meRow.k + meRow.a) / teamKills) * 100) : null;
  const csMin = meRow && lenSecs > 0 ? (meRow.cs / (lenSecs / 60)).toFixed(1) : null;
  const dmgShare = meRow ? meRow.dmg / maxDmg : 0;
  const grade = meRow ? gradeOf(kdaRatio, dmgShare, won && !isRemake) : '—';

  // Posición del jugador local: el bloque EOG la nombra de varias formas y a
  // veces no la trae (entonces el análisis usa el rival que elijas a mano).
  const myLanePosition = String(
    st(meRow?.raw, 'position', 'teamPosition', 'individualPosition', 'PLAYER_POSITION', 'lane') ?? '',
  ).toUpperCase();

  const skinId = num(eog._meSkinId);
  const splashSkin = skinId >= 1000 ? skinId % 1000 : Math.max(0, skinId);
  const splash = meRow ? champSplashUrl(patch, meRow.champ, splashSkin) : null;
  const liveEvents: any[] = Array.isArray(eog._liveEvents) ? eog._liveEvents : [];
  const mapNumber = num(eog._mapNumber) || 11;

  // Ranked / LP (LCU snapshot before/after)
  const ranked = eog._ranked || null;
  const rankAfter = ranked?.after || null;
  const lpDelta: number | null =
    ranked?.lpDelta != null && Number.isFinite(ranked.lpDelta) ? Number(ranked.lpDelta) : null;
  const showRanked = Boolean(rankAfter?.tier) && !isRemake;

  const openAnalysis = () => {
    window.atak.status()
      .then((s: any) => { if (s?.frontend) window.atak.openExternal(String(s.frontend)); })
      .catch(() => {});
  };

  const TeamBlock = ({ title, rows, accent }: { title: string; rows: Row[]; accent: string }) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
        <span className="label" style={{ color: accent }}>{title}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 11px var(--font-data)', color: 'var(--text-dim)' }}>
          <span style={{ color: '#4dbb63' }}>{rows.reduce((a, r) => a + r.k, 0)}</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ color: 'var(--crimson)' }}>{rows.reduce((a, r) => a + r.d, 0)}</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ color: '#6db3ff' }}>{rows.reduce((a, r) => a + r.a, 0)}</span>
        </span>
      </div>
      {/* Cabecera de columnas con iconos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '36px minmax(90px,1.2fr) 72px 132px minmax(90px,1fr) 56px 48px 40px',
          gap: 8, alignItems: 'center', padding: '0 6px',
          fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--text-faint)',
        }}
      >
        <span />
        <span>JUGADOR</span>
        <span style={{ textAlign: 'center' }}>KDA</span>
        <span>ÍTEMS</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconSword size={10} color="#ff9aa0" /> DAÑO</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><IconGold size={10} /> ORO</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><IconMinion size={10} /> CS</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><IconEye size={10} /> VS</span>
      </div>
      {rows.map((r, i) => {
        const tags = perfTags(r, maxDmg, rows.reduce((a, x) => a + x.k, 0), lenSecs);
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px minmax(90px,1.2fr) 72px 132px minmax(90px,1fr) 56px 48px 40px',
              gap: 8, alignItems: 'center',
              background: r.isLocal ? 'rgba(225,36,46,.1)' : 'rgba(255,255,255,.03)',
              borderLeft: `2px solid ${r.isLocal ? 'var(--crimson)' : accent}`,
              padding: '6px 6px',
            }}
          >
            <div style={{ position: 'relative' }}>
              <ChampIcon patch={patch} name={r.champ} size={32} />
              <span style={{
                position: 'absolute', bottom: -3, right: -3, fontSize: 8, fontWeight: 800,
                background: '#0a0a0c', border: '1px solid rgba(255,255,255,.12)', borderRadius: 3, padding: '0 3px',
              }}>
                {r.level}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: r.isLocal ? 700 : 500,
                color: r.isLocal ? '#fff' : 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.name}
              </div>
              <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em', padding: '1px 5px',
                      borderRadius: 3, background: 'rgba(225,36,46,.12)', color: 'var(--crimson-soft)',
                      border: '1px solid rgba(225,36,46,.25)',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <span style={{ font: '600 13px var(--font-data)', textAlign: 'center', color: 'var(--text-soft)' }}>
              <span style={{ color: '#4dbb63' }}>{r.k}</span>
              <span style={{ color: 'var(--text-faint)' }}>/</span>
              <span style={{ color: 'var(--crimson)' }}>{r.d}</span>
              <span style={{ color: 'var(--text-faint)' }}>/</span>
              <span style={{ color: '#6db3ff' }}>{r.a}</span>
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              {r.items.map((id, j) => (
                <ItemIcon key={j} patch={patch} id={id} size={18} trinket={j === 6} empty={!id} />
              ))}
            </div>
            {/* Barra de daño con riel fijo — no se amontona */}
            <DmgBar value={r.dmg} max={maxDmg} height={8} />
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
              font: '600 11px var(--font-data)', color: '#c8aa6e',
            }}>
              <IconGold size={11} />
              {fmtK(r.gold)}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
              font: '500 11px var(--font-data)', color: 'var(--text-soft)',
            }}>
              <IconMinion size={11} color="var(--text-dim)" />
              {r.cs}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3,
              font: '500 11px var(--font-data)', color: 'var(--text-dim)',
            }}>
              <IconEye size={11} />
              {r.vision}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0A0A0C', border: '1px solid rgba(200,205,214,.18)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Barra de arrastre */}
      <div className="drag" style={{
        height: 34, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 10px 0 14px',
        borderBottom: '1px solid rgba(200,205,214,.12)', background: 'linear-gradient(180deg,#14151c,#0a0a0c)', zIndex: 5,
      }}>
        <span className="metal-text" style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.16em' }}>ATAK</span>
        <span style={{ marginLeft: 10, fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>POST-PARTIDA · arrastra para mover</span>
        <button
          className="tb-btn close no-drag"
          onClick={() => window.atak.win('close')}
          style={{ marginLeft: 'auto', width: 40, height: 28 }}
          aria-label="Cerrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>

      {/* Splash de fondo del campeón local (modelo 2D) */}
      {splash && (
        <div style={{ position: 'absolute', inset: 0, top: 34, pointerEvents: 'none', overflow: 'hidden' }}>
          <img
            src={splash}
            alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center',
              opacity: 0.18, filter: 'saturate(0.85) brightness(0.55)',
              transform: 'scale(1.08)',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(10,10,12,.55) 0%,#0A0A0C 55%,#0A0A0C 100%)' }} />
        </div>
      )}

      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 18, padding: '16px 28px 12px', alignItems: 'stretch' }}>
        {/* Campeón 3D — encuadrado en la card (fit automático) */}
        <div style={{ width: 200, height: 260, flex: 'none' }}>
          {meRow ? (
            <ChampionDance
              patch={patch}
              championName={meRow.champ}
              championId={meRow.champId}
              skinId={skinId}
              height={260}
              caption="ESTA PARTIDA"
              style={{ height: 260, width: '100%' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#111', borderRadius: 12 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="display" style={{
            fontWeight: 800, fontSize: 42, letterSpacing: '0.18em', lineHeight: 1,
            background: isRemake
              ? 'linear-gradient(180deg,#aaa,#555)'
              : won
                ? 'linear-gradient(180deg,#fff 0%,#d7dae1 40%,#8b8f9a 70%,#c9cdd6 100%)'
                : 'linear-gradient(180deg,#ff9aa0 0%,#E1242E 55%,#7d1017 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            {isRemake ? 'REMAKE' : resultado}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, letterSpacing: '0.16em', color: 'var(--text-dim)' }}>
            {[modeEs(String(st(eog, 'gameMode') ?? '')), lenSecs > 0 ? fmtClock(lenSecs) : null].filter(Boolean).join(' · ')}
          </div>

          {/* Rango + LP ganado/perdido */}
          {showRanked && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(200,205,214,.12)',
              borderRadius: 8,
              maxWidth: 420,
            }}>
              <RankBadge
                tier={rankAfter.tier}
                division={rankAfter.division}
                lp={rankAfter.lp}
                size={40}
              />
              <div style={{ minWidth: 0 }}>
                <div className="label" style={{ marginBottom: 2 }}>CLASIFICATORIA</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  {lpDelta != null ? (
                    <span
                      className="display"
                      style={{
                        fontWeight: 800, fontSize: 22, letterSpacing: '0.04em',
                        color: lpDelta > 0 ? '#4dbb63' : lpDelta < 0 ? 'var(--crimson)' : 'var(--text-soft)',
                      }}
                    >
                      {lpDelta > 0 ? `+${lpDelta}` : lpDelta} LP
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>ΔLP pendiente…</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    ahora {rankAfter.lp} LP
                  </span>
                </div>
                {/* Barra visual de LP dentro de la división (0–100) */}
                <div style={{ marginTop: 6, height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden', width: 180 }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, rankAfter.lp))}%`,
                    height: '100%',
                    background: lpDelta != null && lpDelta < 0
                      ? 'linear-gradient(90deg,#7d1017,#E1242E)'
                      : 'linear-gradient(90deg,#2d6b3a,#4dbb63)',
                  }} />
                </div>
              </div>
            </div>
          )}

          {meRow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'conic-gradient(from 210deg,#f5f6f8,#7d828e 25%,#d7dae1 50%,#6f7480 75%,#f5f6f8)', display: 'grid', placeItems: 'center', boxShadow: '0 0 18px rgba(225,36,46,.35)' }}>
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#26060a,#0f0507)', display: 'grid', placeItems: 'center' }}>
                  <span className="metal-text-bright" style={{ fontWeight: 800, fontSize: 28 }}>{isRemake ? '—' : grade}</span>
                </div>
              </div>
              <div>
                <div className="display" style={{ fontWeight: 800, fontSize: 26, letterSpacing: '0.06em' }}>
                  <span style={{ color: '#4dbb63' }}>{meRow.k}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: 'var(--crimson)' }}>{meRow.d}</span>
                  <span style={{ color: 'var(--text-faint)' }}> / </span>
                  <span style={{ color: '#6db3ff' }}>{meRow.a}</span>
                  <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--crimson)', fontWeight: 600 }}>KDA {kdaRatio.toFixed(1)}</span>
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                  {meRow.items.map((id, j) => (
                    <ItemIcon key={j} patch={patch} id={id} size={30} trinket={j === 6} empty={!id} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {meRow && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {[
                { v: fmtK(meRow.dmg), k: 'DAÑO', ico: <IconSword size={14} color="#ff9aa0" /> },
                { v: String(meRow.cs), k: csMin ? `CS · ${csMin}/M` : 'CS', ico: <IconMinion size={14} color="#c9cdd6" /> },
                { v: fmtK(meRow.gold), k: 'ORO', ico: <IconGold size={14} /> },
                { v: String(meRow.vision), k: 'VISIÓN', ico: <IconEye size={14} color="#6db3ff" /> },
                ...(part != null ? [{ v: `${part}%`, k: 'KP', ico: <IconSword size={14} color="#E1242E" /> }] : []),
              ].map((s) => (
                <div
                  key={s.k}
                  className="stat-chip iconic"
                  style={{ minWidth: 68, padding: '7px 12px', border: '1px solid rgba(200,205,214,.12)' }}
                >
                  <span className="ico">{s.ico}</span>
                  <div className="v" style={{ fontSize: 15 }}>{s.v}</div>
                  <div className="k">{s.k}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hr" style={{ margin: '0 28px', position: 'relative', zIndex: 1 }} />

      {/* Tabs */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 8, padding: '8px 28px 0' }}>
        {([
          ['board', 'SCOREBOARD'],
          ['timeline', 'MAPA · TIMELINE'],
          ['analysis', 'ANÁLISIS · RUNAS'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="btn"
            style={{
              padding: '5px 14px', fontSize: 10,
              color: tab === id ? '#fff' : 'var(--text-dim)',
              background: tab === id ? 'linear-gradient(100deg,var(--crimson-deep),var(--crimson))' : 'transparent',
              border: tab === id ? 'none' : '1px solid rgba(200,205,214,.2)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, padding: '10px 28px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {tab === 'board' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <TeamBlock title="TU EQUIPO" rows={allyRows} accent="#6db3ff" />
            {enemyRows.length > 0 && <TeamBlock title="ENEMIGO" rows={enemyRows} accent="var(--crimson)" />}
          </div>
        ) : tab === 'analysis' ? (
          <div className="panel" style={{ flex: 1, minHeight: 0, padding: 12, overflow: 'auto' }}>
            <EogRuneAnalysis
              patch={patch}
              myChampion={meRow?.champ || ''}
              myItems={meRow?.items || []}
              usedRunes={readUsedRunes(meRow?.raw)}
              enemyChampions={enemyRows.map((r) => r.champ).filter(Boolean)}
              defaultRival={myLanePosition
                ? enemyRows.find((r) => String(
                    st(r.raw, 'position', 'teamPosition', 'individualPosition', 'PLAYER_POSITION', 'lane') ?? '',
                  ).toUpperCase() === myLanePosition)?.champ || ''
                : ''}
              position={myLanePosition || 'MIDDLE'}
            />
          </div>
        ) : (
          <div className="panel" style={{ flex: 1, minHeight: 0, padding: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="label" style={{ marginBottom: 8 }}>GRIETA · EVENTOS LIVE (mapa DDragon)</div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MapTimeline events={liveEvents} lenSecs={lenSecs} mapNumber={mapNumber} patch={patch} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
          <button className="btn btn-ghost skew" style={{ '--skew': '9px' } as any} onClick={openAnalysis}>ANÁLISIS COMPLETO</button>
          <button className="btn btn-primary skew" style={{ '--skew': '9px' } as any} onClick={() => window.atak.win('close')}>SIGUIENTE PARTIDA</button>
        </div>
      </div>
    </div>
  );
}
