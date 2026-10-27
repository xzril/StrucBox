// 3D view of a cable: the shape is the solved equilibrium shape, so dragging a load re-sags the cable live (D27).
// Once the solution is shown, the cable is shaded by its tension (light = F_H at the lowest point, dark = T_max).
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fmt } from '../lib/format';
import type { Palette } from '../lib/theme';
import type { Cable, CablePoint, CableSolution } from '../solver/cable';
import { Arrow, Invisible, snapStep } from './BeamView3D';

const SPAN = 10; // drawn width in scene units
const RADIAL = 8;

export function CableView3D({ c, s, showSolution, onMovePoint, C }: { c: Cable; s: CableSolution; showSolution: boolean; onMovePoint: (p: CablePoint) => void; C: Palette }) {
  const L = c.B.x - c.A.x;
  const k = SPAN / L;
  const yTop = Math.max(c.A.y, c.B.y);
  const yLow = Math.min(c.A.y, c.B.y, s.low?.y ?? Infinity, ...s.pointY);
  const X = (x: number) => (x - c.A.x) * k - SPAN / 2;
  const Y = (y: number) => (y - yLow) * k;
  const xOf = (wx: number) => (wx + SPAN / 2) / k + c.A.x;
  const height = Y(yTop);
  const ground = -0.8;

  // the cable as straight pieces between loads, each sampled finely enough for a curved shape
  const pts = useMemo(() => {
    const cuts = [c.A.x, ...c.points.map((p) => p.x).sort((a, b) => a - b), c.B.x];
    const out: { x: number; v: THREE.Vector3 }[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const n = c.w0 || c.w1 || c.w2 ? 40 : 1;
      for (let j = i ? 1 : 0; j <= n; j++) {
        const x = cuts[i] + ((cuts[i + 1] - cuts[i]) * j) / n;
        const y = j === 0 && i === 0 ? c.A.y : j === n && i + 2 === cuts.length ? c.B.y : s.y(x);
        out.push({ x, v: new THREE.Vector3(X(x), Y(y), 0) });
      }
    }
    return out;
  }, [c, s]);

  const geom = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i + 1 < pts.length; i++) path.add(new THREE.LineCurve3(pts[i].v, pts[i + 1].v));
    const segs = Math.max(200, pts.length * 4);
    const g = new THREE.TubeGeometry(path, segs, 0.07, RADIAL, false);
    // colour each ring by the tension at its x
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const [lo, hi, base] = [new THREE.Color(C.reaction).lerp(new THREE.Color('#ffffff'), 0.55), new THREE.Color(C.reaction), new THREE.Color(C.beam)];
    const span = Math.max(s.Tmax - s.H, 1e-9);
    for (let i = 0; i < pos.count; i++) {
      const x = xOf(pos.getX(i));
      const T = s.H * Math.hypot(1, s.slope(Math.min(c.B.x, Math.max(c.A.x, x))));
      const col = showSolution ? lo.clone().lerp(hi, (T - s.H) / span) : base;
      colors.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [pts, showSolution, C]);
  useEffect(() => () => geom.dispose(), [geom]);

  // dragging a concentrated load along the span
  const [drag, setDrag] = useState<string | null>(null);
  const controls = useRef<{ enabled: boolean } | null>(null);
  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  const step = snapStep(L);
  const onDragMove = (e: ThreeEvent<PointerEvent>) => {
    const p = drag && c.points.find((q) => q.id === drag);
    if (!p) return;
    const x = Math.min(c.B.x - step, Math.max(c.A.x + step, Math.round(xOf(e.point.x) / step) * step));
    if (x !== p.x) onMovePoint({ ...p, x });
  };
  const maxP = Math.max(1e-9, ...c.points.map((p) => p.P));
  const dist = c.w1 || c.w2;
  const deckY = Math.min(...pts.map((p) => p.v.y)) - 0.6;
  const F = c.units.force;

  const supportAt = (P: Cable['A'], T: number, atA: boolean) => {
    const sl = s.slope(atA ? c.A.x + 1e-9 * L : c.B.x - 1e-9 * L);
    // the support's pull on the cable: along the cable's end, away from the span
    const ang = Math.atan2(atA ? -sl : sl, atA ? -1 : 1) - Math.PI / 2;
    const [x, y] = [X(P.x), Y(P.y)];
    return (
      <group key={P.label}>
        <mesh position={[x, (y + ground) / 2 - 0.1, 0]}>
          <boxGeometry args={[0.3, y - ground + 0.2, 0.3]} />
          <meshStandardMaterial color={C.support} metalness={0.1} roughness={0.7} />
        </mesh>
        <mesh position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.45, 20]} />
          <meshStandardMaterial color={C.beam} />
        </mesh>
        <Html position={[x + (atA ? -0.35 : 0.35), y + 0.3, 0]} center className="label support-label">
          {P.label}
        </Html>
        {showSolution && (
          <group position={[x, y, 0]} rotation={[0, 0, ang]}>
            <Arrow from={0.3} to={1.4} color={C.reaction} />
            <Html position={[0, 1.75, 0]} center className="label reaction-label">
              T = {fmt(T)} {F}
            </Html>
          </group>
        )}
      </group>
    );
  };

  return (
    <div className={`view3d ${drag ? 'dragging' : ''}`}>
      <Canvas camera={{ position: [0, height / 2 + 1, 14], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={[C.bg]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <OrbitControls ref={controls as never} enabled={!drag} target={[0, height / 2, 0]} />
        <gridHelper key={C.bg} args={[30, 30, C.grid[0], C.grid[1]]} position={[0, ground, 0]} />

        <mesh geometry={geom}>
          <meshStandardMaterial vertexColors metalness={0.3} roughness={0.5} />
        </mesh>

        {supportAt(c.A, s.TA, true)}
        {supportAt(c.B, s.TB, false)}

        {c.points.map((p, i) => {
          const len = 0.6 + 0.9 * (p.P / maxP);
          const y = Y(s.pointY[i]);
          return (
            <group
              key={p.id}
              position={[X(p.x), y, 0]}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (controls.current) controls.current.enabled = false;
                setDrag(p.id);
              }}
            >
              <mesh>
                <sphereGeometry args={[0.13, 16, 12]} />
                <meshStandardMaterial color={C.support} />
              </mesh>
              <Arrow from={-0.15} to={-0.15 - len} color={C.load} />
              <Html position={[0, -len - 0.45, 0]} center className="label load-label">
                {p.label}: {fmt(p.P)} {F}
              </Html>
              {showSolution && (
                <Html position={[0.25, 0.35, 0]} center className="label truss-label">
                  y = {fmt(s.pointY[i])}
                </Html>
              )}
            </group>
          );
        })}

        {dist && (
          // the deck the hangers carry: the distributed load acts along the horizontal
          <group>
            <mesh position={[0, deckY, 0]}>
              <boxGeometry args={[SPAN, 0.12, 0.5]} />
              <meshStandardMaterial color={C.load} transparent opacity={0.8} />
            </mesh>
            {Array.from({ length: 19 }, (_, i) => {
              const x = c.A.x + (L * (i + 1)) / 20;
              const top = Y(s.y(x));
              return (
                <mesh key={i} position={[X(x), (top + deckY) / 2, 0]}>
                  <boxGeometry args={[0.025, top - deckY, 0.025]} />
                  <meshStandardMaterial color={C.beam} />
                </mesh>
              );
            })}
            <Html position={[0, deckY - 0.35, 0]} center className="label load-label">
              w = {fmt(c.w1)}
              {c.w2 !== c.w1 ? ` to ${fmt(c.w2)}` : ''} {F}/{c.units.length}
            </Html>
          </group>
        )}
        {c.w0 > 0 && (
          <Html position={[0, Y(s.low?.y ?? yLow) - 0.45, 0]} center className="label load-label">
            own weight w₀ = {fmt(c.w0)} {F}/{c.units.length}
          </Html>
        )}

        {showSolution && s.low && (
          <Html position={[X(s.low.x), Y(s.low.y) + 0.35, 0]} center className="label truss-label">
            lowest, F_H = {fmt(s.H)} {F}
          </Html>
        )}
        {showSolution &&
          s.segments.map((sg, i) => {
            const [a, b] = [pts[i].v, pts[i + 1].v];
            return (
              <Html key={i} position={[(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.3, 0]} center className="label truss-label" style={{ color: C.reaction }}>
                {fmt(sg.T, 3)} {F}
              </Html>
            );
          })}

        {/* invisible plane that tracks the pointer while dragging */}
        <mesh onPointerMove={onDragMove}>
          <planeGeometry args={[200, 200]} />
          <Invisible />
        </mesh>
      </Canvas>
      <div className="view-hint">{c.points.length ? 'Drag a load along the span: the cable re-sags as it would in equilibrium. ' : ''}Drag empty space to rotate, scroll or pinch to zoom.</div>
    </div>
  );
}
