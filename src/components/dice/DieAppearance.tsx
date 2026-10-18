import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { DIE_STYLES, type DieKind } from '../../game/dice';

export interface DieFeedback { hovered: boolean; pressed: boolean; impact: number }
export type DiePointerHandlers = Pick<ThreeElements['mesh'], 'onPointerOver' | 'onPointerOut' | 'onPointerDown' | 'onPointerUp' | 'onPointerMove' | 'onPointerCancel'>;

interface DieAppearanceProps {
  kind: DieKind;
  geometry: THREE.BufferGeometry;
  edges: THREE.EdgesGeometry;
  meshRef: RefObject<THREE.Mesh>;
  feedback: MutableRefObject<DieFeedback>;
  handlers: DiePointerHandlers;
  isRolling: boolean;
  rollNonce: number;
  duration: number;
  motion: boolean;
}

/** Surface treatment and interaction feedback; never modifies the rigid geometry. */
export default function DieAppearance({ kind, geometry, edges, meshRef, feedback, handlers, isRolling, rollNonce, duration, motion }: DieAppearanceProps) {
  const style = DIE_STYLES[kind];
  const shell = useRef<THREE.MeshPhysicalMaterial>(null);
  const core = useRef<THREE.MeshStandardMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  const accent = useRef<THREE.LineDashedMaterial>(null);
  const accentLines = useRef<THREE.LineSegments>(null);
  const glow = useRef<THREE.LineBasicMaterial>(null);
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => { accentLines.current?.computeLineDistances(); }, [edges]);
  useFrame(({ clock }, delta) => {
    const state = feedback.current;
    state.impact = motion ? Math.max(0, state.impact - delta * 4) : 0;
    const progress = isRolling ? Math.min(1, (Date.now() - rollNonce) / Math.max(1, duration)) : 1;
    const energy = isRolling ? 1 - THREE.MathUtils.smoothstep(progress, .58, .96) : 0;
    const press = state.pressed ? .32 : state.hovered ? .1 : 0;
    const pulse = .3 + energy * (.18 + Math.sin(clock.elapsedTime * 5) * .06) + state.impact * .18 + press;
    if (shell.current) shell.current.emissiveIntensity = pulse;
    if (core.current) core.current.emissiveIntensity = pulse * .8;
    if (edge.current) edge.current.opacity = Math.min(1, .75 + energy * .15 + state.impact * .1 + press);
    if (accent.current) accent.current.opacity = Math.min(.95, .6 + press + state.impact * .15);
    if (glow.current) glow.current.opacity = .2 + press * .4 + state.impact * .1;
    if (isRolling || state.impact > 0) invalidate();
  });

  return <>
    <mesh ref={meshRef} name="dice-shell" geometry={geometry} {...handlers}>
      <meshPhysicalMaterial ref={shell} color={style.color} emissive={style.emissive} emissiveIntensity={.3}
        roughness={.14} metalness={.38} clearcoat={1} clearcoatRoughness={.08}
        iridescence={.5} iridescenceIOR={1.3} iridescenceThicknessRange={[120, 420]} />
    </mesh>
    <mesh geometry={geometry}>
      <meshStandardMaterial ref={core} color={style.color} emissive={style.emissive} emissiveIntensity={.22}
        roughness={.5} metalness={.14} transparent opacity={.16} side={THREE.BackSide} />
    </mesh>
    <lineSegments geometry={edges}><lineBasicMaterial color="#1d103f" transparent opacity={.32} /></lineSegments>
    <lineSegments geometry={edges} scale={1.006}><lineBasicMaterial ref={edge} color="#e9ddff" transparent opacity={.82} /></lineSegments>
    <lineSegments geometry={edges} scale={1.02}>
      <lineBasicMaterial ref={glow} color="#8de8ff" transparent opacity={.2} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
    <lineSegments ref={accentLines} geometry={edges} scale={1.012}>
      <lineDashedMaterial ref={accent} color="#93f1ff" transparent opacity={.72} dashSize={.1} gapSize={.06} scale={1.6} />
    </lineSegments>
  </>;
}
