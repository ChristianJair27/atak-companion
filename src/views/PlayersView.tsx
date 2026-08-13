// src/views/PlayersView.tsx — F8: roster amplio (2 columnas), form gráfico, spells OK.
import { useCallback, useEffect, useState } from 'react';
import {
  ChampIcon,
  ItemIcon,
  RankBadge,
  SpellIcon,
  fmtClock,
  keystoneIconUrl,
  posEs,
  useLive,
  usePatch,
  type PatchInfo,
} from './shared';

interface RecentMatch {
  id: string;
  createdAt: string;
  gameType: string;
  gameLength: number;
  championId: number;
  championName: string;
  items: number[];
  kills: number;
  deaths: number;
  assists: number;
  result: string;
  win: boolean | null;
}

interface DayForm {
  wins: number;
  losses: number;
  games: number;
  winRate: number | null;
}

interface PlayerRow {
  riotId: string;
  name: string;
  championName: string;
  team: 'ORDER' | 'CHAOS';
  isMe: boolean;
  position: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  items: number[];
  spell1: number | string;
  spell2: number | string;
  keystoneId: number;
  primaryRuneTree: number;
  secondaryRuneTree: number;
  opgg?: {
    rank: {
      tier: string | null;
      division: number | string | null;
      lp: number | null;
      wins: number;
      losses: number;
      tier_image_url?: string | null;
    } | null;
    seasonWinRate: number | null;
    seasonPlay: number;
    tags: string[];
    champStat: {
      play: number;
      win: number;
      win_rate: number;
      avg_kills: number;
      avg_deaths: number;
      avg_assists: number;
      kda: number | string;
    } | null;
    recentMatches?: RecentMatch[];
    today?: DayForm | null;
    error?: string;
  };
}

interface RosterPayload {
  ok: boolean;
  region?: string;
  gameTime?: number;
  meChampion?: string | null;
  mePosition?: string | null;
  players: PlayerRow[];
  build: {
    rune_ids: number[];
    primary_rune_names: string[];
    secondary_rune_names: string[];
    core_item_ids: number[];
    boots_id: number;
    starter_ids: number[];
    skill_order: string[];
    win_rate: number | null;
    pick_rate: number | null;
    tier: number | null;
  } | null;
}

const QUEUE_SHORT: Record<string, string> = {
  SOLORANKED: 'Solo', FLEXRANKED: 'Flex', NORMAL: 'Normal', ARAM: 'ARAM', URF: 'URF', CHERRY: 'Arena',
};

function fmtMatchClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Gráfico de form (barras W/L) + WR hoy + popup al hover. */
function FormChart({
  matches, patch, today,
}: {
  matches: RecentMatch[];
  patch: PatchInfo | null;
  today?: DayForm | null;
}) {
  const [open, setOpen] = useState(false);
  const form = matches.slice(0, 10);
  if (!form.length) {
    return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sin historial</span>;
  }

  const dayWr = today?.winRate;
  const dayLabel = today && today.games > 0 ? `${today.wins}W − ${today.losses}L` : null;

  return (
    <div
      style={{ position: 'relative', minWidth: 160 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        {/* WR del día grande */}
        <div style={{ flex: 'none', minWidth: 72 }}>
          {dayWr != null ? (
            <>
              <div style={{
                font: '800 22px var(--font-data)', lineHeight: 1,
                color: dayWr >= 50 ? 'var(--green)' : 'var(--crimson)',
              }}>
                {dayWr}%
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-dim)', marginTop: 2 }}>
                HOY · {dayLabel}
              </div>
            </>
          ) : (
            <>
              <div style={{ font: '700 16px var(--font-data)', color: 'var(--text-faint)' }}>—</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>HOY</div>
            </>
          )}
        </div>

        {/* Barras de form (más altas, legibles) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, flex: 1 }}>
          {form.map((m, i) => {
            const won = m.win === true;
            const lost = m.win === false;
            const h = won || lost ? 28 : 12;
            const color = won ? '#4dbb63' : lost ? '#E1242E' : 'rgba(255,255,255,.18)';
            return (
              <div
                key={m.id || i}
                title={`${m.championName} · ${m.result}`}
                style={{
                  width: 12, height: h, borderRadius: 3, background: color,
                  boxShadow: won || lost ? `0 0 6px ${color}66` : undefined,
                  flex: 'none',
                }}
              />
            );
          })}
        </div>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 8, zIndex: 60,
            width: 320, maxHeight: 280, overflow: 'auto',
            background: 'rgba(8,9,12,.98)',
            border: '1px solid rgba(200,205,214,.25)',
            borderRadius: 10,
            boxShadow: '0 16px 40px rgba(0,0,0,.7)',
            padding: 10,
            pointerEvents: 'none',
          }}
        >
          <div className="label" style={{ marginBottom: 8, fontSize: 10 }}>ÚLTIMAS PARTIDAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {form.map((m, i) => {
              const won = m.win === true;
              const lost = m.win === false;
              const accent = won ? '#4dbb63' : lost ? '#E1242E' : 'rgba(255,255,255,.25)';
              return (
                <div
                  key={m.id || i}
                  style={{
                    display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center',
                    padding: '6px 8px',
                    background: won ? 'rgba(77,187,99,.1)' : lost ? 'rgba(225,36,46,.1)' : 'rgba(255,255,255,.04)',
                    borderLeft: `3px solid ${accent}`, borderRadius: '0 6px 6px 0',
                  }}
                >
                  <ChampIcon patch={patch} name={m.championName} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{won ? 'W' : lost ? 'L' : '—'}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.championName || '—'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{QUEUE_SHORT[m.gameType] || ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                      {(m.items.length ? m.items : [0, 0, 0, 0, 0, 0]).slice(0, 6).map((id, j) => (
                        <ItemIcon key={j} patch={patch} id={id} size={18} empty={!id} />
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ font: '700 13px var(--font-data)' }}>
                      <span style={{ color: 'var(--green)' }}>{m.kills}</span>
                      <span style={{ color: 'var(--text-faint)' }}>/</span>
                      <span style={{ color: 'var(--crimson)' }}>{m.deaths}</span>
                      <span style={{ color: 'var(--text-faint)' }}>/</span>
                      <span style={{ color: '#6db3ff' }}>{m.assists}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {m.gameLength > 0 ? fmtMatchClock(m.gameLength) : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCard({
  p, liveP, patch, loading,
}: {
  p: PlayerRow;
  liveP: any;
  patch: PatchInfo | null;
  loading: boolean;
}) {
  const k = liveP?.kills ?? p.kills;
  const d = liveP?.deaths ?? p.deaths;
  const a = liveP?.assists ?? p.assists;
  const cs = liveP?.creepScore ?? p.creepScore;
  const items = liveP?.items ?? p.items ?? [];
  const dead = Boolean(liveP?.isDead);
  const og = p.opgg;
  const spell1 = liveP?.spell1 ?? p.spell1;
  const spell2 = liveP?.spell2 ?? p.spell2;
  const keyUrl = keystoneIconUrl(p.keystoneId);

  return (
    <div
      style={{
        padding: '12px 14px',
        borderLeft: `3px solid ${p.isMe ? '#c8aa6e' : p.team === 'ORDER' ? '#0bc4e3' : '#e84057'}`,
        background: p.isMe
          ? 'linear-gradient(90deg, rgba(200,170,110,.12), rgba(12,14,18,.9))'
          : 'linear-gradient(90deg, rgba(20,24,32,.95), rgba(10,12,16,.92))',
        borderTop: '1px solid rgba(200,170,110,.1)',
        borderBottom: '1px solid rgba(0,0,0,.4)',
        opacity: dead ? 0.5 : 1,
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 14,
        alignItems: 'center',
        minHeight: 108,
        overflow: 'visible',
        position: 'relative',
      }}
    >
      {/* Spells + champ */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SpellIcon patch={patch} spell={spell1} size={28} />
          <SpellIcon patch={patch} spell={spell2} size={28} />
        </div>
        <div style={{ position: 'relative' }}>
          <ChampIcon patch={patch} name={p.championName} size={56} />
          <span style={{
            position: 'absolute', bottom: -4, right: -4, fontSize: 11, fontWeight: 800,
            background: '#0a0a0c', border: '1px solid rgba(200,170,110,.4)', color: '#c8aa6e',
            borderRadius: 4, padding: '1px 5px',
          }}>
            {liveP?.level ?? p.level}
          </span>
        </div>
      </div>

      {/* Identidad + rank + form */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: p.isMe ? '#c8aa6e' : '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {p.name || p.riotId}
          </span>
          {p.position && (
            <span className="badge badge-outline" style={{ fontSize: 11, padding: '2px 8px' }}>{posEs(p.position)}</span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{p.championName}</span>
          {keyUrl && <img src={keyUrl} alt="" width={24} height={24} style={{ borderRadius: 4, marginLeft: 4 }} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {og?.rank?.tier ? (
            <RankBadge
              tier={og.rank.tier}
              division={og.rank.division}
              lp={og.rank.lp}
              size={36}
              emblemUrl={og.rank.tier_image_url}
            />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{og?.error || (loading ? '…' : 'UNRANKED')}</span>
          )}
          {og?.seasonWinRate != null && (
            <span style={{
              fontSize: 13, fontWeight: 800, padding: '3px 10px', borderRadius: 5,
              background: og.seasonWinRate >= 50 ? 'rgba(77,187,99,.14)' : 'rgba(225,36,46,.14)',
              color: og.seasonWinRate >= 50 ? 'var(--green)' : 'var(--crimson)',
            }}>
              {og.seasonWinRate}% temp · {og.seasonPlay}G
            </span>
          )}
          {og?.champStat && (
            <span style={{ fontSize: 13, color: 'var(--text-soft)' }}>
              <span style={{ fontWeight: 800, color: og.champStat.win_rate >= 50 ? 'var(--green)' : 'var(--crimson)' }}>
                {og.champStat.win_rate}%
              </span>
              {' '}en {p.championName} · KDA {og.champStat.kda}
            </span>
          )}
        </div>

        <FormChart matches={og?.recentMatches || []} patch={patch} today={og?.today} />

        {!!og?.tags?.length && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {og.tags.map((t) => (
              <span key={t} style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4,
                background: 'rgba(200,170,110,.12)', color: '#c8aa6e', border: '1px solid rgba(200,170,110,.28)',
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Live KDA + items */}
      <div style={{ textAlign: 'right', flex: 'none', minWidth: 120 }}>
        <div style={{ font: '800 20px var(--font-data)', letterSpacing: '0.02em' }}>
          <span style={{ color: 'var(--green)' }}>{k}</span>
          <span style={{ color: 'var(--text-faint)' }}> / </span>
          <span style={{ color: 'var(--crimson)' }}>{d}</span>
          <span style={{ color: 'var(--text-faint)' }}> / </span>
          <span style={{ color: '#6db3ff' }}>{a}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>CS {cs}</div>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', marginTop: 8 }}>
          {(items.length ? items : [0, 0, 0, 0, 0, 0]).slice(0, 6).map((id: number, i: number) => (
            <ItemIcon key={i} patch={patch} id={id} size={26} empty={!id} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RuneImg({ id, size = 22 }: { id: number; size?: number }) {
  const [src, setSrc] = useState<string | null>(
    keystoneIconUrl(id) || `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/${id}.png`,
  );
  if (!id || !src) {
    return <span style={{ width: size, height: size, borderRadius: 4, background: 'rgba(255,255,255,.05)', display: 'inline-block' }} />;
  }
  return (
    <img
      src={src} alt="" width={size} height={size}
      style={{ borderRadius: 4, border: '1px solid rgba(200,205,214,.15)', background: '#0a0a0c', objectFit: 'cover' }}
      onError={() => setSrc(null)}
    />
  );
}

export default function PlayersView() {
  const live = useLive();
  const patch = usePatch();
  const [data, setData] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    window.atak
      .opggRoster()
      .then((r: RosterPayload) => {
        setData(r);
        if (!r?.ok) setErr('Sin partida activa o OP.GG no respondió');
      })
      .catch((e: any) => setErr(e?.message || 'Error OP.GG'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const liveById = new Map<string, any>();
  for (const p of live?.state?.players || []) liveById.set(String(p.riotId).toLowerCase(), p);

  const players = data?.players || [];
  const blue = players.filter((p) => p.team === 'ORDER');
  const red = players.filter((p) => p.team !== 'ORDER');
  const build = data?.build;
  const meChamp = data?.meChampion;
  const mePos = data?.mePosition;

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      // Estética in-game LoL: panel oscuro, borde metal/oro, no “app web”
      background: 'linear-gradient(180deg, rgba(8,10,14,.97) 0%, rgba(5,6,8,.98) 100%)',
      border: '1px solid rgba(200,170,110,.28)',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.6), 0 0 40px rgba(0,0,0,.5)',
    }}>
      {/* Title bar LoL-like — arrastrable */}
      <div className="drag" style={{
        height: 42, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 14px',
        borderBottom: '1px solid rgba(200,170,110,.22)',
        background: 'linear-gradient(180deg, #1a1610 0%, #0c0d12 100%)',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
          letterSpacing: '0.18em', color: '#c8aa6e',
        }}>ATAK</span>
        <span style={{ marginLeft: 12, fontSize: 12, letterSpacing: '0.14em', color: 'rgba(200,170,110,.7)', textTransform: 'uppercase' }}>
          Scoreboard · F8
        </span>
        <span className="mono" style={{ marginLeft: 14, fontSize: 14, color: '#e8e0d0', fontWeight: 700 }}>
          {fmtClock(live?.state?.gameTime ?? data?.gameTime ?? 0)}
        </span>
        <span style={{ marginLeft: 12, fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
          {data?.region || '…'} · arrastra para mover
        </span>
        <div className="no-drag" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" style={{ padding: '5px 14px', fontSize: 11 }} onClick={load} disabled={loading}>
            {loading ? 'CARGANDO…' : 'RECARGAR'}
          </button>
          <button type="button" className="tb-btn close" style={{ width: 36, height: 30 }} onClick={() => window.atak.win('close')} aria-label="Cerrar">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: '8px 16px', fontSize: 13, color: 'var(--crimson-soft)', background: 'rgba(225,36,46,.1)' }}>{err}</div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, padding: 12 }}>
        {/* Dos columnas de equipo — cards grandes, no 5 en fila */}
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6db3ff', boxShadow: '0 0 10px #6db3ff' }} />
              <span className="display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', color: '#6db3ff' }}>LADO AZUL</span>
            </div>
            {blue.map((p) => (
              <PlayerCard key={p.riotId + p.championName} p={p} liveP={liveById.get(String(p.riotId).toLowerCase())} patch={patch} loading={loading} />
            ))}
            {loading && !blue.length && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="panel" style={{ height: 110, opacity: 0.35 }} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--crimson)', boxShadow: '0 0 10px var(--crimson)' }} />
              <span className="display" style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', color: 'var(--crimson)' }}>LADO ROJO</span>
            </div>
            {red.map((p) => (
              <PlayerCard key={p.riotId + p.championName} p={p} liveP={liveById.get(String(p.riotId).toLowerCase())} patch={patch} loading={loading} />
            ))}
            {loading && !red.length && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="panel" style={{ height: 110, opacity: 0.35 }} />
            ))}
          </div>
        </div>

        {/* Sidebar build */}
        <div className="panel" style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'auto' }}>
          <div>
            <div className="display" style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.12em', color: '#c8aa6e' }}>BUILD META</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {meChamp || '—'} · {posEs(mePos || '') || 'ALL'}
            </div>
          </div>

          {meChamp && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ChampIcon patch={patch} name={meChamp} size={56} />
              <div>
                {build?.win_rate != null && (
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{Math.round(build.win_rate * 100)}% WR</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {build?.pick_rate != null ? `${(build.pick_rate * 100).toFixed(1)}% pick` : ''}
                  {build?.tier != null ? ` · Tier ${build.tier}` : ''}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 8, fontSize: 10 }}>RUNAS</div>
            {build?.rune_ids?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {build.rune_ids.slice(0, 9).map((id, i) => (
                  <RuneImg key={`${id}-${i}`} id={id} size={i === 0 ? 36 : 26} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{loading ? 'Consultando OP.GG…' : 'Sin datos'}</div>
            )}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 8, fontSize: 10 }}>CORE</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(build?.core_item_ids || []).slice(0, 6).map((id, i) => (
                <ItemIcon key={i} patch={patch} id={id} size={36} />
              ))}
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 8, fontSize: 10 }}>BOTAS · STARTER</div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {build?.boots_id ? <ItemIcon patch={patch} id={build.boots_id} size={32} /> : null}
              <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,.12)', margin: '0 4px' }} />
              {(build?.starter_ids || []).slice(0, 3).map((id, i) => (
                <ItemIcon key={i} patch={patch} id={id} size={28} />
              ))}
            </div>
          </div>

          {!!build?.skill_order?.length && (
            <div>
              <div className="label" style={{ marginBottom: 8, fontSize: 10 }}>SKILLS</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {build.skill_order.slice(0, 12).map((s, i) => (
                  <span key={i} style={{
                    width: 24, height: 24, display: 'grid', placeItems: 'center',
                    fontSize: 12, fontWeight: 800, borderRadius: 4,
                    background: s === 'R' ? 'rgba(225,36,46,.25)' : 'rgba(255,255,255,.08)',
                    color: s === 'R' ? 'var(--crimson-soft)' : 'var(--text-soft)',
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
            OP.GG MCP · hover en el form para partidas
          </div>
        </div>
      </div>
    </div>
  );
}
