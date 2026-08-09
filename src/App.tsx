// src/App.tsx — router por ventana (?view=main|hud|champselect|scoreboard|eog|caster)
// PLACEHOLDERS FUNCIONALES: muestran los datos reales de la capa Electron para
// validar el pipeline; el diseño definitivo (rojo/plata/negro del logo nuevo)
// se aplicará cuando llegue el mockup. NO invertir en estilos aquí todavía.
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    atak: {
      status: () => Promise<any>;
      patchData: () => Promise<any>;
      onPhase: (fn: (p: string) => void) => () => void;
      onLive: (fn: (p: any) => void) => () => void;
      onGameStarted: (fn: () => void) => () => void;
      onGameEnded: (fn: () => void) => () => void;
      onChampSelect: (fn: (p: any) => void) => () => void;
      onChampSelectEnded: (fn: () => void) => () => void;
      onChampionBuild: (fn: (p: any) => void) => () => void;
      onChampionBuildLoading: (fn: (p: any) => void) => () => void;
      onChampionBuildError: (fn: (p: any) => void) => () => void;
      onEogData: (fn: (p: any) => void) => () => void;
      onSummoner: (fn: (p: any) => void) => () => void;
      onLcuConnected: (fn: () => void) => () => void;
      onLcuDisconnected: (fn: () => void) => () => void;
      casterStart: (cfg: any) => Promise<any>;
      casterStop: () => Promise<any>;
      openExternal: (url: string) => void;
      win: (a: 'minimize' | 'close' | 'hide') => void;
    };
  }
}

const view = new URLSearchParams(location.search).get('view') || 'main';

const panel: React.CSSProperties = {
  background: 'rgba(10,10,14,0.9)', borderRadius: 14, padding: 14,
  border: '1px solid rgba(225,36,46,0.35)', margin: 8,
};

function useLive() {
  const [live, setLive] = useState<any>(null);
  useEffect(() => window.atak.onLive(setLive), []);
  return live;
}

function MainView() {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    const t = setInterval(() => window.atak.status().then(setStatus), 2000);
    window.atak.status().then(setStatus);
    return () => clearInterval(t);
  }, []);
  const [caster, setCaster] = useState({ channel: 'lqc-2026', token: '', matchLabel: '', team1: '', team2: '', streamUrl: '', backend: '' });
  return (
    <div style={{ ...panel, minHeight: '95vh', background: '#0a0a0c' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>ATAK Companion <small>(base técnica — diseño pendiente)</small></h2>
        <div>
          <button onClick={() => window.atak.win('minimize')}>—</button>
          <button onClick={() => window.atak.win('close')}>✕</button>
        </div>
      </div>
      <pre style={{ fontSize: 12, opacity: 0.8 }}>{JSON.stringify(status, null, 2)}</pre>
      <h3>Modo Caster LQC</h3>
      <div style={{ display: 'grid', gap: 6, maxWidth: 420 }}>
        {(['channel', 'token', 'matchLabel', 'team1', 'team2', 'streamUrl'] as const).map((k) => (
          <input key={k} placeholder={k} value={(caster as any)[k]}
            onChange={(e) => setCaster((c) => ({ ...c, [k]: e.target.value }))} />
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.atak.casterStart({ ...caster, backend: status?.backend, logo1: '', logo2: '', showOverlay: false })}>
            Iniciar transmisión de datos
          </button>
          <button onClick={() => window.atak.casterStop()}>Detener</button>
        </div>
      </div>
    </div>
  );
}

function HudView() {
  const live = useLive();
  const s = live?.state;
  const o = live?.objectives;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  if (!s) return <div style={panel}>Esperando partida…</div>;
  return (
    <div style={panel}>
      <b>{fmt(s.gameTime)} · {s.gameMode}</b>
      {s.me && (
        <div>
          {s.me.championName} · Nv.{s.me.level} · {s.me.kills}/{s.me.deaths}/{s.me.assists} · {s.me.creepScore} CS · {s.me.gold} oro · KP {s.me.killParticipation}%
        </div>
      )}
      {o && (
        <div style={{ marginTop: 6 }}>
          🐉 {o.dragon.alive ? 'VIVO' : fmt(Math.max(0, o.dragon.nextAt - s.gameTime))}
          {o.herald.nextAt != null && <> · 👁 {o.herald.alive ? 'VIVO' : fmt(Math.max(0, o.herald.nextAt - s.gameTime))}</>}
          {o.baron.nextAt != null && <> · 🟣 {o.baron.alive ? 'VIVO' : fmt(Math.max(0, o.baron.nextAt - s.gameTime))}</>}
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 12 }}>
        {(s.players || []).map((p: any, i: number) => (
          <div key={i} style={{ opacity: p.isDead ? 0.5 : 1 }}>
            [{p.team === 'ORDER' ? 'AZ' : 'RJ'}] {p.championName} {p.name} — {p.kills}/{p.deaths}/{p.assists}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChampSelectView() {
  const [cs, setCs] = useState<any>(null);
  const [build, setBuild] = useState<any>(null);
  useEffect(() => {
    const offs = [
      window.atak.onChampSelect(setCs),
      window.atak.onChampionBuild(setBuild),
      window.atak.onChampionBuildLoading(() => setBuild({ loading: true })),
      window.atak.onChampSelectEnded(() => { setCs(null); setBuild(null); }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return (
    <div style={panel}>
      <b>Champ Select</b> {cs && <>· fase {cs.phase} · {cs.timerSecs}s</>}
      {build?.loading && <div>Cargando build…</div>}
      {build && !build.loading && <pre style={{ fontSize: 11, maxHeight: 500, overflow: 'auto' }}>{JSON.stringify(build, null, 2)}</pre>}
    </div>
  );
}

function ScoreboardView() {
  const live = useLive();
  const s = live?.state;
  if (!s) return <div style={panel}>Sin partida</div>;
  const side = (team: string) => (s.players || []).filter((p: any) => p.team === team);
  return (
    <div style={{ ...panel, display: 'flex', gap: 18 }}>
      {(['ORDER', 'CHAOS'] as const).map((t) => (
        <div key={t} style={{ flex: 1 }}>
          <b style={{ color: t === 'ORDER' ? '#3b82f6' : '#e1242e' }}>{t === 'ORDER' ? 'AZUL' : 'ROJO'}</b>
          {side(t).map((p: any, i: number) => (
            <div key={i}>{p.championName} · {p.name} · {p.kills}/{p.deaths}/{p.assists} · {p.creepScore} CS</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EogView() {
  const [eog, setEog] = useState<any>(null);
  useEffect(() => window.atak.onEogData(setEog), []);
  return (
    <div style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>Fin de partida</b>
        <button onClick={() => window.atak.win('close')}>✕</button>
      </div>
      <pre style={{ fontSize: 11, maxHeight: 560, overflow: 'auto' }}>{JSON.stringify(eog, null, 2)?.slice(0, 6000)}</pre>
    </div>
  );
}

function CasterView() {
  const live = useLive();
  const s = live?.state;
  const o = live?.objectives;
  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  if (!s || !o) return null; // transparente hasta que haya partida
  return (
    <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', ...panel }}>
      {fmt(s.gameTime)} · 🐉 {o.dragon.alive ? 'VIVO' : fmt(Math.max(0, o.dragon.nextAt - s.gameTime))}
      {o.baron.nextAt != null && <> · 🟣 {o.baron.alive ? 'VIVO' : fmt(Math.max(0, o.baron.nextAt - s.gameTime))}</>}
    </div>
  );
}

export default function App() {
  switch (view) {
    case 'hud': return <HudView />;
    case 'champselect': return <ChampSelectView />;
    case 'scoreboard': return <ScoreboardView />;
    case 'eog': return <EogView />;
    case 'caster': return <CasterView />;
    default: return <MainView />;
  }
}
