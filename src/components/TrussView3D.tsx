// 3D view of a plane truss: bars coloured by tension / compression once the solution is shown.
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { fmt } from '../lib/format';
import type { Palette } from '../lib/theme';
import type { Truss, TrussSolution } from '../solver/truss';
import { Arrow, SupportGlyph } from './BeamView3D';

const SPAN = 10; // drawn width in scene units
const up = new THREE.Vector3(0, 1, 0);

export function TrussView3D({ t, s, showSolution, C }: { t: Truss; s: TrussSolution; showSolution: boolean; C: Palette }) {
  const xs = t.joints.map((j) => j.x);
  const ys = t.joints.map((j) => j.y);
  const [x0, y0] = [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys)];
  const k = SPAN / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-9);
  const P = (l: string) => {
    const j = t.joints.find((p) => p.label === l)!;
    return new THREE.Vector3((j.x - x0) * k, (j.y - y0) * k, 0);
  };
  const height = (Math.max(...ys) - y0) * k;
  const maxF = Math.max(1e-9, ...t.loads.map((l) => Math.hypot(l.Fx, l.Fy)));

  return (
    <div className="view3d">
      <Canvas camera={{ position: [0, height / 2 + 1, 14], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={[C.bg]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 8, 6]} intensity={1.1} />
        <OrbitControls target={[0, height / 2, 0]} />
        <gridHelper key={C.bg} args={[30, 30, C.grid[0], C.grid[1]]} position={[0, -1.2, 0]} />

        {t.members.map((m, i) => {
          const [a, b] = [P(m[0]), P(m[1])];
          const d = b.clone().sub(a);
          const f = s.forces[i];
          const zero = Math.abs(f) < 1e-9;
          const color = !showSolution || zero ? C.beam : f > 0 ? C.reaction : C.load;
          const mid = a.clone().add(b).multiplyScalar(0.5);
          return (
            <group key={i}>
              <mesh position={mid} quaternion={new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize())}>
                <boxGeometry args={[0.16, d.length(), 0.3]} />
                <meshStandardMaterial color={color} metalness={0.2} roughness={0.6} transparent={showSolution && zero} opacity={showSolution && zero ? 0.45 : 1} />
              </mesh>
              {showSolution && (
                <Html position={[mid.x, mid.y, 0.2]} center className="label truss-label" style={{ color }}>
                  {zero ? '0' : `${fmt(Math.abs(f), 3)} ${f > 0 ? 'T' : 'C'}`}
                </Html>
              )}
            </group>
          );
        })}

        {t.joints.map((j) => {
          const p = P(j.label);
          return (
            <group key={j.label} position={p}>
              <mesh>
                <cylinderGeometry args={[0.16, 0.16, 0.4, 20]} />
                <meshStandardMaterial color={C.support} />
              </mesh>
              <Html position={[0.3, 0.3, 0]} center className="label support-label">
                {j.label}
              </Html>
            </group>
          );
        })}

        {t.supports.map((sp, i) => (
          // the glyph's tip at the joint; an inclined roller turns so its reaction points along its angle
          <group key={i} position={P(sp.joint).add(new THREE.Vector3(0, -0.16, 0))} rotation={[0, 0, (((sp.angle ?? 90) - 90) * Math.PI) / 180]}>
            <SupportGlyph type={sp.type} atRight={false} color={C.support} />
          </group>
        ))}

        {t.loads.map((l) => {
          const F = Math.hypot(l.Fx, l.Fy);
          if (!F) return null;
          const len = 0.8 + 1.0 * (F / maxF);
          // Arrow draws along +y; turn it so it points along the load, tip at the joint
          const rot = Math.atan2(l.Fy, l.Fx) - Math.PI / 2;
          return (
            <group key={l.id} position={P(l.joint)} rotation={[0, 0, rot]}>
              <Arrow from={-len - 0.2} to={-0.2} color={C.load} />
              <Html position={[0, -len - 0.45, 0]} center className="label load-label">
                {fmt(F)} {t.units.force}
              </Html>
            </group>
          );
        })}

        {showSolution &&
          s.reactions.map((r) => {
            const R = Math.hypot(r.Rx, r.Ry);
            if (R < 1e-9) return null;
            const rot = Math.atan2(r.Ry, r.Rx) - Math.PI / 2;
            return (
              <group key={r.joint} position={P(r.joint)} rotation={[0, 0, rot]}>
                <Arrow from={-2.0} to={-0.75} color={C.reaction} />
                <Html position={[0, -2.25, 0]} center className="label reaction-label">
                  {fmt(R)} {t.units.force}
                </Html>
              </group>
            );
          })}
      </Canvas>
      <div className="view-hint">Drag to rotate, scroll or pinch to zoom.</div>
    </div>
  );
}
