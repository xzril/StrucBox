import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fmt, rotWord } from '../lib/format';
import type { Palette } from '../lib/theme';
import { bendScale } from '../lib/bend';
import { unitStr } from '../lib/units';
import { momentAboutPoint, pointAt, valueAt, type Solution } from '../solver/solve';
import { totalDownward } from '../solver/loads';
import type { Load, Problem } from '../solver/types';

const BEAM_W = 10; // world length of the beam
const H = 0.36; // beam depth
const D = 0.5; // beam width

interface Props {
  problem: Problem;
  solution: Solution;
  showSolution: boolean;
  bend: boolean;
  onMoveLoad: (l: Load) => void;
  C: Palette;
}

type Drag = { id: string; mode: 'move' | 'start' | 'end'; offset: number };

export function BeamView3D({ problem: p, solution: s, showSolution, bend, onMoveLoad, C }: Props) {
  const L = p.length;
  const S = BEAM_W / L;
  const wx = (x: number) => x * S - BEAM_W / 2;
  const bx = (worldX: number) => (worldX + BEAM_W / 2) / S;
  const [drag, setDrag] = useState<Drag | null>(null);
  const u = p.units;

  // deflection scale (D14): true scale when visible, else exaggerated with a notice
  const { k, trueScale } = bendScale(p, s, S);
  const dy = (x: number) => (bend ? valueAt(s.segments, x, 'EIy') * k : 0);
  const note = !bend ? '' : trueScale ? 'Deflection drawn to true scale.' : 'Deflection not to scale, exaggerated for visualization.';

  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const controls = useRef<{ enabled: boolean } | null>(null);
  const step = snapStep(L);
  const onDragMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag) return;
    const l = p.loads.find((m) => m.id === drag.id);
    if (!l) return;
    const x = clamp(Math.round((bx(e.point.x) - drag.offset) / step) * step, 0, L);
    if (l.kind !== 'dist') return x !== l.x && onMoveLoad({ ...l, x });
    const len = l.x2 - l.x1;
    if (drag.mode === 'move') {
      const x1 = clamp(x, 0, L - len);
      if (x1 !== l.x1) onMoveLoad({ ...l, x1, x2: round(x1 + len, step) });
    } else if (drag.mode === 'start') {
      const x1 = Math.min(x, l.x2 - step);
      if (x1 !== l.x1) onMoveLoad({ ...l, x1 });
    } else {
      const x2 = Math.max(x, l.x1 + step);
      if (x2 !== l.x2) onMoveLoad({ ...l, x2 });
    }
  };
  const grab = (l: Load, mode: Drag['mode']) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // disable now: waiting for the re-render lets the first pointer moves rotate the camera
    if (controls.current) controls.current.enabled = false;
    const at = l.kind === 'dist' ? (mode === 'end' ? l.x2 : l.x1) : l.x;
    setDrag({ id: l.id, mode, offset: mode === 'move' ? bx(e.point.x) - at : 0 });
  };

  const maxP = Math.max(1e-9, ...p.loads.map((l) => (l.kind === 'point' ? Math.hypot(l.P, l.Px ?? 0) : 0)));
  // supports, loads and points can sit on rigid arms off the beam axis (an L-shaped member, a bracket)
  const arms = [...p.supports, ...p.loads.filter((l) => l.kind === 'point')].filter((a) => Math.abs(a.y ?? 0) > 1e-9) as { x: number; y: number }[];
  const reach = Math.max(0, ...[...arms, ...p.points].map((a) => Math.abs(a.y ?? 0) * S));
  const maxW = Math.max(1e-9, ...p.loads.map((l) => (l.kind === 'dist' ? Math.max(Math.abs(l.w1), Math.abs(l.w2)) : 0)));
  const top = (x: number) => H / 2 + dy(x);
  const bottom = (x: number) => -H / 2 + dy(x);
  const Fu = unitStr.force(u);
  const Mu = unitStr.moment(u);

  return (
    <div className={`view3d ${drag ? 'dragging' : ''}`}>
      <Canvas camera={{ position: [0, 1, 9.5], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={[C.bg]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <FitWidth reach={reach} />
        <OrbitControls ref={controls as never} enabled={!drag} target={[0, -0.2 + reach / 2, 0]} />
        <gridHelper key={C.bg} args={[30, 30, C.grid[0], C.grid[1]]} position={[0, -3.3, 0]} />

        <Dimensions
          xs={[0, L, ...p.supports.map((sp) => sp.x), ...p.loads.flatMap((l) => (l.kind === 'dist' ? [l.x1, l.x2] : [l.x]))]}
          wx={wx}
          S={S}
          unit={u.length}
          color={C.support}
        />

        <DeformedBeam bx={bx} dy={dy} color={C.beam} />

        {[...new Map(arms.map((a) => [`${a.x},${a.y}`, a])).values()].map((a) => (
          <group key={`${a.x},${a.y}`} position={[wx(a.x), dy(a.x) + (a.y * S) / 2, 0]}>
            <mesh>
              <boxGeometry args={[H, Math.abs(a.y * S) + H, D]} />
              <meshStandardMaterial color={C.beam} metalness={0.2} roughness={0.6} />
            </mesh>
            <Html position={[a.x > L / 2 ? 0.6 : -0.6, 0, D]} center className="label dim-label">
              {fmt(Math.abs(a.y))} {u.length}
            </Html>
          </group>
        ))}

        {p.supports.map((sp) =>
          sp.y ? (
            // on an arm: the symbol hangs from (or stands on) the arm's far end
            <group key={sp.id} position={[wx(sp.x), dy(sp.x) + sp.y * S + Math.sign(sp.y) * (H / 2), 0]} rotation={[0, 0, sp.y > 0 ? Math.PI : 0]}>
              {sp.type === 'fixed' ? (
                <mesh position={[0, -0.15, 0]}>
                  <boxGeometry args={[1.6, 0.3, 1.2]} />
                  <meshStandardMaterial color={C.support} />
                </mesh>
              ) : (
                <SupportGlyph type={sp.type} atRight={false} color={C.support} />
              )}
              <Html position={[0.55, -0.35, D]} center className="label support-label">
                {sp.label}
              </Html>
            </group>
          ) : (
            <group key={sp.id} position={[wx(sp.x), bottom(sp.x), 0]}>
              {/* an inclined roller (rocker, incline, cable) tilts so its reaction points along its angle */}
              <group rotation={[0, 0, sp.type === 'roller' && sp.angle !== undefined ? ((sp.angle - 90) * Math.PI) / 180 : 0]}>
                <SupportGlyph type={sp.type} atRight={sp.x > L / 2} color={C.support} />
              </group>
              <Html position={[sp.x > L / 2 ? 0.55 : -0.55, -0.35, D]} center className="label support-label">
                {sp.label}
              </Html>
            </group>
          ),
        )}

        {p.points
          .filter((q) => q.y)
          .map((q) => (
            <group key={q.label} position={[wx(q.x), dy(q.x) + q.y! * S, 0]}>
              <mesh>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color={C.support} />
              </mesh>
              <Html position={[0.35, 0.3, D]} center className="label support-label">
                {q.label}
              </Html>
            </group>
          ))}

        {p.loads.map((l) => {
          if (l.kind === 'point') {
            const F = Math.hypot(l.P, l.Px ?? 0);
            const len = 0.8 + 1.0 * (F / maxP);
            // drawn along y, then turned to the force's direction: a downward force ends on the beam, an upward one starts there
            const down = l.P >= 0;
            const turn = Math.atan2(-l.P, l.Px ?? 0) + (down ? Math.PI / 2 : -Math.PI / 2);
            return (
              <group key={l.id} position={[wx(l.x), l.y ? dy(l.x) + l.y * S : top(l.x), 0]} onPointerDown={grab(l, 'move')}>
                <group rotation={[0, 0, turn]}>
                  <Arrow from={down ? len : 0} to={down ? 0 : len} color={C.load} />
                  <HitBox h={len} />
                  <Html position={[0, len + 0.3, 0]} center className="label load-label">
                    {fmt(F)} {Fu}
                  </Html>
                </group>
              </group>
            );
          }
          if (l.kind === 'moment') {
            return (
              <group key={l.id} position={[wx(l.x), dy(l.x), 0]} onPointerDown={grab(l, 'move')}>
                <MomentArc r={0.6} dir={l.dir} color={C.load} />
                <mesh>
                  <sphereGeometry args={[0.7]} />
                  <Invisible />
                </mesh>
                <Html position={[0, 1.0, 0]} center className="label load-label">
                  {fmt(l.M)} {Mu} {l.dir === 'cw' ? '↻' : '↺'}
                </Html>
              </group>
            );
          }
          const n = Math.max(2, Math.round(((l.x2 - l.x1) * S) / 0.45) + 1);
          const hAt = (x: number) => 0.25 + 1.2 * (Math.abs(l.w1 + ((l.w2 - l.w1) * (x - l.x1)) / (l.x2 - l.x1)) / maxW);
          const xs = Array.from({ length: n }, (_, i) => l.x1 + ((l.x2 - l.x1) * i) / (n - 1));
          return (
            <group key={l.id}>
              <group onPointerDown={grab(l, 'move')}>
                {xs.map((x, i) => (
                  <group key={i} position={[wx(x), top(x), 0]}>
                    <Arrow from={hAt(x)} to={0} color={C.load} thin />
                  </group>
                ))}
                <Line points={xs.map((x) => [wx(x), top(x) + hAt(x), 0] as [number, number, number])} color={C.load} lineWidth={2} />
                <mesh position={[wx((l.x1 + l.x2) / 2), top((l.x1 + l.x2) / 2) + 0.7, 0]}>
                  <boxGeometry args={[(l.x2 - l.x1) * S, 1.4, 0.6]} />
                  <Invisible />
                </mesh>
              </group>
              {(['start', 'end'] as const).map((m) => {
                const x = m === 'start' ? l.x1 : l.x2;
                return (
                  <mesh key={m} position={[wx(x), top(x) + hAt(x), 0]} onPointerDown={grab(l, m)}>
                    <sphereGeometry args={[0.13, 16, 16]} />
                    <meshStandardMaterial color={C.handle} />
                    {/* bigger hit area; reaches in front of the load's move box so the dot wins the click */}
                    <mesh>
                      <sphereGeometry args={[0.4]} />
                      <Invisible />
                    </mesh>
                  </mesh>
                );
              })}
              <Html position={[wx((l.x1 + l.x2) / 2), top((l.x1 + l.x2) / 2) + 1.75, 0]} center className="label load-label">
                {l.w1 === l.w2 ? `${fmt(l.w1)} ${unitStr.dist(u)}` : `${fmt(l.w1)} → ${fmt(l.w2)} ${unitStr.dist(u)}`}
              </Html>
            </group>
          );
        })}

        {s.reactions.map((r) => {
          const y0 = r.y ? dy(r.x) + r.y * S + Math.sign(r.y) * 0.9 : bottom(r.x) - (r.type === 'fixed' ? 0.15 : 0.62);
          const up = r.Ry >= 0;
          const right = r.Rx >= 0;
          return (
            <group key={r.supportId} position={[wx(r.x), y0, 0.45]}>
              {Math.abs(r.Rx) > 1e-9 && (
                // under the vertical reaction, pointing along the beam, clear of a wall
                <group position={[r.x > L / 2 ? -0.7 : 0.7, -1.5, 0]}>
                  <group rotation={[0, 0, -Math.PI / 2]}>
                    <Arrow from={right ? -0.55 : 0.55} to={right ? 0.55 : -0.55} color={C.reaction} />
                  </group>
                  <Html position={[0, -0.35, 0]} center className="label reaction-label">
                    {r.label}
                    <sub>x</sub> = {showSolution ? `${fmt(Math.abs(r.Rx))} ${Fu} ${right ? '→' : '←'}` : '?'}
                  </Html>
                </group>
              )}
              {Math.abs(r.Ry) > 1e-9 && <Arrow from={up ? -1.1 : 0} to={up ? 0 : -1.1} color={C.reaction} />}
              <Html position={[0.55, -0.7, 0]} center className="label reaction-label">
                {r.label}
                <sub>y</sub> = {showSolution ? `${fmt(Math.abs(r.Ry))} ${Fu} ${up ? '↑' : '↓'}` : '?'}
              </Html>
              {r.type === 'fixed' && Math.abs(r.M!) > 1e-9 && (
                <group position={[0, -y0 + dy(r.x) + r.y * S, 0]}>
                  <MomentArc r={0.85} dir={r.M! > 0 ? 'ccw' : 'cw'} color={C.reaction} />
                  <Html position={[0, 1.25, 0]} center className="label reaction-label">
                    M<sub>{r.label}</sub> = {showSolution ? `${fmt(Math.abs(r.M!))} ${Mu} ${r.M! > 0 ? '↺' : '↻'}` : '?'}
                  </Html>
                </group>
              )}
            </group>
          );
        })}

        {p.asked.momentAbout.map((label, k) => {
          const at = pointAt(p, label);
          if (!at) return null;
          const { x, y } = at;
          const M = momentAboutPoint(p, x, y);
          const ref = Math.max(1e-9, totalDownward(p.loads) * L);
          const r = 0.35 + 0.9 * Math.min(1, Math.abs(M) / ref);
          // one row per moment arm, stacked above the beam, so the d labels never sit on each other
          // shortcut: moment arms are drawn for the first asked point only, one row each, so labels never overlap; the steps list every arm
          // shortcut: arms drawn only for vertical loads level with the point; inclined ones are listed by component in the steps
          const arms = (k === 0 && !y ? p.loads.filter((l) => l.kind === 'point' && !l.Px && !l.y && Math.abs(l.x - x) > 1e-9) : []) as { id: string; x: number }[];
          const rowY = (i: number) => H / 2 + 0.25 + i * 0.45;
          return (
            <group key={label}>
              <group position={[wx(x), dy(x) + y * S, D / 2 + 0.05]}>
                {Math.abs(M) > 1e-9 && <MomentArc r={r} dir={M > 0 ? 'ccw' : 'cw'} color={C.moment} />}
                <Html position={[x > L / 2 ? -1 : 1, Math.max(r + 0.55, rowY(arms.length) + 0.1 - dy(x)), 0]} center className="label moment-label">
                  {p.supports.some((sp) => sp.type === 'fixed' && sp.label === label) ? (
                    <>
                      (M<sub>R</sub>)<sub>{label}</sub>
                    </>
                  ) : (
                    <>
                      M<sub>{label}</sub>
                    </>
                  )}{' '}
                  = {showSolution ? `${fmt(Math.abs(M))} ${Mu} ${M > 0 ? '↺' : M < 0 ? '↻' : ''}` : '?'}
                </Html>
              </group>
              {arms.map((l, i) => (
                <group key={l.id}>
                  <Line
                    points={[
                      [wx(x), rowY(i), D / 2 + 0.1],
                      [wx(l.x), rowY(i), D / 2 + 0.1],
                    ]}
                    color={C.moment}
                    dashed
                    dashSize={0.15}
                    gapSize={0.1}
                    lineWidth={2}
                  />
                  <Html position={[wx(x) + Math.sign(l.x - x) * 0.75, rowY(i) + 0.13, D / 2 + 0.1]} center className="label moment-label">
                    d = {fmt(Math.abs(l.x - x))} {u.length}
                  </Html>
                </group>
              ))}
            </group>
          );
        })}

        {/* invisible plane that tracks the pointer while dragging */}
        <mesh onPointerMove={onDragMove}>
          <planeGeometry args={[200, 200]} />
          <Invisible />
        </mesh>
      </Canvas>
      <div className="view-hint">
        Drag loads along the beam{p.loads.some((l) => l.kind === 'dist') ? ', drag the dots to resize a distributed load' : ''}. Drag empty space to
        rotate, scroll or pinch to zoom.
      </div>
      {note && <div className="view-note">{note}</div>}
    </div>
  );
}

/** Dimension line under the beam: a tick at every support and load position, the length of each
 * part, and the full span under it. */
function Dimensions({ xs, wx, S, unit, color }: { xs: number[]; wx: (x: number) => number; S: number; unit: string; color: string }) {
  const ticks = [...new Set(xs.map((x) => +x.toFixed(6)))].sort((a, b) => a - b);
  const y = -2.3;
  const z = 0.45;
  const line = (pts: [number, number][]) => (
    <Line points={pts.map(([x, yy]) => [x, yy, z] as [number, number, number])} color={color} lineWidth={1.5} />
  );
  return (
    <group>
      {line([[wx(ticks[0]), y], [wx(ticks[ticks.length - 1]), y]])}
      {ticks.map((x) => (
        <group key={x}>{line([[wx(x), y - 0.12], [wx(x), y + 0.12]])}</group>
      ))}
      {ticks.slice(1).map((b, i) => {
        const a = ticks[i];
        // shortcut: parts narrower than ~5% of the drawn span get no label; the full span and d labels still show
        if ((b - a) * S < 0.5) return null;
        return (
          <Html key={b} position={[wx((a + b) / 2), y - 0.3, z]} center className="label dim-label">
            {fmt(b - a)} {unit}
          </Html>
        );
      })}
      {ticks.length > 2 && (
        <>
          {line([[wx(ticks[0]), y - 0.7], [wx(ticks[ticks.length - 1]), y - 0.7]])}
          {[ticks[0], ticks[ticks.length - 1]].map((x) => (
            <group key={x}>{line([[wx(x), y - 0.82], [wx(x), y - 0.58]])}</group>
          ))}
          <Html position={[0, y - 1.0, z]} center className="label dim-label">
            L = {fmt(ticks[ticks.length - 1] - ticks[0])} {unit}
          </Html>
        </>
      )}
    </group>
  );
}

/** Back the camera off on narrow (phone) screens so the whole beam and its supports fit the width. */
function FitWidth({ reach }: { reach: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.position.z = Math.max(9.5, 15 / (size.width / size.height)) + 1.2 * reach;
    camera.position.y = 1 + reach / 2;
  }, [camera, size.width, size.height, reach]);
  return null;
}

function DeformedBeam({ bx, dy, color }: { bx: (w: number) => number; dy: (x: number) => number; color: string }) {
  const geom = useMemo(() => new THREE.BoxGeometry(BEAM_W, H, D, 200, 1, 1), []);
  const base = useMemo(() => Float32Array.from(geom.attributes.position.array as Float32Array), [geom]);
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, base[i * 3 + 1] + dy(bx(base[i * 3])));
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
  });
  return (
    <mesh ref={ref} geometry={geom}>
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.6} />
    </mesh>
  );
}

/** Arrow along y from `from` to `to` (tip at `to`), in the parent's frame. */
function Arrow({ from, to, color, thin }: { from: number; to: number; color: string; thin?: boolean }) {
  const len = Math.abs(to - from);
  const dir = Math.sign(to - from) || -1;
  const head = Math.min(thin ? 0.18 : 0.28, len * 0.6);
  const shaft = Math.max(0, len - head);
  return (
    <group>
      <mesh position={[0, from + (dir * shaft) / 2, 0]}>
        <cylinderGeometry args={[thin ? 0.025 : 0.045, thin ? 0.025 : 0.045, shaft, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, to - (dir * head) / 2, 0]} rotation={[0, 0, dir > 0 ? 0 : Math.PI]}>
        <coneGeometry args={[thin ? 0.08 : 0.13, head, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

/** Transparent but still hit by the pointer (visible={false} meshes are skipped). */
const Invisible = () => <meshBasicMaterial transparent opacity={0} depthWrite={false} />;

function HitBox({ h }: { h: number }) {
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[0.5, h, 0.5]} />
      <Invisible />
    </mesh>
  );
}

function MomentArc({ r, dir, color }: { r: number; dir: 'cw' | 'ccw'; color: string }) {
  const arc = Math.PI * 1.3; // gap of 0.7π centred at the bottom; mirrored for clockwise
  return (
    <group scale={[dir === 'ccw' ? 1 : -1, 1, 1]} rotation={[0, 0, -0.35 * Math.PI]}>
      <mesh>
        <torusGeometry args={[r, 0.04, 8, 48, arc]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[r * Math.cos(arc), r * Math.sin(arc), 0]} rotation={[0, 0, arc]}>
        <coneGeometry args={[0.11, 0.26, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function SupportGlyph({ type, atRight, color }: { type: Problem['supports'][number]['type']; atRight: boolean; color: string }) {
  const tri = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-0.3, -0.45);
    s.lineTo(0.3, -0.45);
    s.closePath();
    return s;
  }, []);
  const mat = <meshStandardMaterial color={color} />;
  if (type === 'free') return null;
  if (type === 'fixed')
    return (
      <mesh position={[atRight ? 0.15 : -0.15, H / 2, 0]}>
        <boxGeometry args={[0.3, 2.2, 1.2]} />
        {mat}
      </mesh>
    );
  return (
    <group>
      <mesh position={[0, 0, -0.3]}>
        <extrudeGeometry args={[tri, { depth: 0.6, bevelEnabled: false }]} />
        {mat}
      </mesh>
      {type === 'pin' ? (
        <mesh position={[0, -0.5, 0]}>
          <boxGeometry args={[0.9, 0.1, 0.8]} />
          {mat}
        </mesh>
      ) : (
        [-0.17, 0.17].map((x) => (
          <mesh key={x} position={[x, -0.53, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.6, 16]} />
            {mat}
          </mesh>
        ))
      )}
    </group>
  );
}


function snapStep(L: number) {
  const raw = L / 40;
  let step = 10 ** Math.floor(Math.log10(raw));
  if (raw / step >= 5) step *= 5;
  else if (raw / step >= 2) step *= 2;
  return step;
}
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, step: number) => Math.round(x / step) * step;
