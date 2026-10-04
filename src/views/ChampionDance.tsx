// src/views/ChampionDance.tsx — Campeón 3D bailando (misma fuente CDN que aka.gg).
// GLB: cdn.modelviewer.lol/lol/models/{slug}/{skinId}/model.glb
// Skin: Live Client skinID (p.ej. 55007) o fallback championId*1000.
// Sin R3F: three.js puro para no inflar el bundle del companion.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { champSplashUrl, type PatchInfo } from './shared';

export function modelViewerUrl(slug: string, skinOrBaseId: number): string {
  return `https://cdn.modelviewer.lol/lol/models/${slug.toLowerCase()}/${skinOrBaseId}/model.glb`;
}

/** Resuelve ID de skin para modelviewer a partir de Live Client skinID. */
export function resolveSkinModelId(champId: number, liveSkinId: number): number {
  if (liveSkinId >= 1000) return liveSkinId;
  if (champId > 0) return champId * 1000 + Math.max(0, liveSkinId);
  return liveSkinId || 0;
}

async function probeGlb(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const ct = res.headers.get('content-type') || '';
    return res.ok && !ct.includes('text/html');
  } catch {
    return false;
  }
}

function pickDanceClip(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
  if (!clips.length) return null;
  const lower = clips.map((c) => c.name.toLowerCase());
  for (const w of ['dance', 'emote', 'taunt', 'idle', 'loop']) {
    const i = lower.findIndex((n) => n.includes(w));
    if (i >= 0) return clips[i];
  }
  return clips[0];
}

export default function ChampionDance(props: {
  patch: PatchInfo | null;
  championName: string;
  championId: number;
  skinId?: number;
  height?: number | string;
  caption?: string;
  style?: CSSProperties;
}) {
  const { patch, championName, championId, skinId = 0, height = 200, caption, style } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'loading' | 'model' | 'fallback'>('loading');
  const [src, setSrc] = useState<string | null>(null);

  const slug = championId > 0 ? patch?.byKey[championId]?.id : null;
  const splash = champSplashUrl(patch, championName, (() => {
    if (skinId >= 1000) return skinId % 1000;
    return Math.max(0, skinId);
  })());

  // Resolver URL del GLB (skin → base → fallback splash)
  useEffect(() => {
    let cancelled = false;
    if (!slug || !championId) {
      setPhase('fallback');
      return;
    }
    setPhase('loading');
    (async () => {
      const primary = resolveSkinModelId(championId, skinId);
      const candidates = [
        modelViewerUrl(slug, primary),
        modelViewerUrl(slug, championId * 1000),
      ];
      // Evitar duplicados
      const uniq = Array.from(new Set(candidates));
      for (const url of uniq) {
        if (await probeGlb(url)) {
          if (!cancelled) {
            setSrc(url);
            setPhase('model');
          }
          return;
        }
      }
      if (!cancelled) setPhase('fallback');
    })();
    return () => { cancelled = true; };
  }, [slug, championId, skinId]);

  // Montar three.js
  useEffect(() => {
    if (phase !== 'model' || !src || !mountRef.current) return;
    const el = mountRef.current;
    const w = el.clientWidth || 160;
    const h = el.clientHeight || 200;

    const scene = new THREE.Scene();
    // Cámara frontal fija — se reencuadra al cargar el modelo.
    const camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 200);
    camera.position.set(0, 0.9, 3.2);
    camera.lookAt(0, 0.6, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2.5, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-3, 2, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xe1242e, 0.35);
    rim.position.set(-2, 3, -3);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    let mixer: THREE.AnimationMixer | null = null;
    let raf = 0;
    let alive = true;
    const clock = new THREE.Clock();

    /** Encuadra el modelo dentro de la card con margen (sin recortar). */
    const fitInCard = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      object.position.x -= center.x;
      object.position.y -= center.y;
      object.position.z -= center.z;

      // Pequeño margen vertical para pies/cabeza
      const pad = 1.12;
      const maxDim = Math.max(size.x * pad, size.y * pad, size.z * pad) || 1;
      const fov = camera.fov * (Math.PI / 180);
      const distForHeight = (maxDim / 2) / Math.tan(fov / 2);
      const distForWidth = distForHeight / Math.max(0.2, camera.aspect);
      const distance = Math.max(distForHeight, distForWidth) * 1.05;

      // Ligeramente por encima del centro para “retrato” de campeón
      const lookY = size.y * 0.02;
      camera.position.set(0, lookY + size.y * 0.04, distance);
      camera.near = Math.max(0.05, distance / 100);
      camera.far = distance * 100;
      camera.lookAt(0, lookY, 0);
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (!alive) return;
        const model = gltf.scene;
        model.rotation.set(0, 0, 0);
        root.clear();
        root.add(model);
        fitInCard(root);

        mixer = new THREE.AnimationMixer(model);
        const clip = pickDanceClip(gltf.animations || []);
        if (clip) {
          const action = mixer.clipAction(clip);
          action.reset().play();
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
      },
      undefined,
      () => {
        if (alive) setPhase('fallback');
      },
    );

    const tick = () => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      mixer?.update(dt);
      // Sin rotación de cámara ni del root — siempre de frente.
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!el) return;
      const nw = el.clientWidth || w;
      const nh = el.clientHeight || h;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    };
    window.addEventListener('resize', onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      mixer?.stopAllAction();
      renderer.dispose();
      el.innerHTML = '';
    };
  }, [phase, src]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'radial-gradient(ellipse 70% 40% at 50% 100%, rgba(232,50,60,.28), rgba(0,0,0,0) 70%)',
        border: '1px solid rgba(255,255,255,.09)',
        ...style,
      }}
    >
      {(phase === 'fallback' || phase === 'loading') && splash && (
        <img
          src={splash}
          alt={championName}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'top center',
            opacity: phase === 'loading' ? 0.45 : 0.92,
            filter: 'saturate(0.95)',
          }}
        />
      )}
      {phase === 'model' && (
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      )}
      {phase === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 2 }}>
          <span className="dot" />
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 10px 8px', background: 'linear-gradient(transparent,rgba(8,8,10,.92))', zIndex: 3, pointerEvents: 'none' }}>
        {caption && (
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#b6b6c0', fontWeight: 600, textTransform: 'uppercase' }}>
            {caption}
          </div>
        )}
        <div className="display" style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.1, letterSpacing: '0.03em', textTransform: 'uppercase', textAlign: caption ? 'left' : 'center' }}>
          {championName || '—'}
        </div>
      </div>
    </div>
  );
}
