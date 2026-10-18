import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { createDiceCamera, fitDiceCamera, getDiceView, DIE_RADIUS, DICE_ARENA_HALF_HEIGHT } from '../utils/diceCamera';
import DiceNumber3D from './DiceNumber3D';

type TroubleDice3DProps = {
  rollNonce: number;
  isRolling: boolean;
  displayValue: string;
  duration: number;
  active: boolean;
  stageRef: RefObject<HTMLSpanElement>;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const CHAMBER_HALF_HEIGHT = DICE_ARENA_HALF_HEIGHT;
const CHAMBER_HALF_DEPTH = 1.15;
const WALL_THICKNESS = 0.14;
const FLOOR_Y = -CHAMBER_HALF_HEIGHT;
// Side rails extend upward, but there is no horizontal ceiling collider.
const RAIL_TOP = 100;
const RAIL_HALF_HEIGHT = (RAIL_TOP - FLOOR_Y) / 2;
const RAIL_CENTER_Y = (RAIL_TOP + FLOOR_Y) / 2;

type DiceSceneProps = Pick<TroubleDice3DProps, 'rollNonce' | 'isRolling' | 'duration' | 'stageRef' | 'displayValue'>;

function DiceBody({ rollNonce, isRolling, duration, displayValue, stageRef, halfWidth, headroom }: DiceSceneProps & { halfWidth: number; headroom: number }) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const [launched, setLaunched] = useState(isRolling);
  const lastRollNonceRef = useRef(isRolling ? 0 : rollNonce);
  const previousHalfWidth = useRef(halfWidth);
  const impact = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const edgeMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeAccentMaterialRef = useRef<THREE.LineDashedMaterial | null>(null);
  const edgeEtchMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeGlowMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeAccentRef = useRef<THREE.LineSegments | null>(null);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(DIE_RADIUS, 0), []);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useEffect(() => {
    if (edgeAccentRef.current) {
      edgeAccentRef.current.computeLineDistances();
    }
  }, [edgesGeometry]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edgesGeometry.dispose();
    };
  }, [edgesGeometry, geometry]);

  const tossDie = useCallback(() => {
    const body = rigidBodyRef.current;
    if (!body) return;

    const euler = new THREE.Euler(
      randomBetween(0, Math.PI * 2),
      randomBetween(0, Math.PI * 2),
      randomBetween(0, Math.PI * 2),
    );
    const rotation = new THREE.Quaternion().setFromEuler(euler);

    impact.current = 1;
    const position = { x: randomBetween(-0.2, 0.2), y: 0.05, z: randomBetween(-0.12, 0.12) };
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.wakeUp();
    const direction = Math.random() < .5 ? -1 : 1;
    const mass = body.mass();
    // One off-center throw supplies both linear momentum and natural spin.
    // Its strength does not depend on the screen width or a prescribed route.
    body.applyImpulseAtPoint({
      x: direction * mass * randomBetween(9.5, 12.5),
      y: mass * randomBetween(9, 11),
      z: mass * randomBetween(-1.6, 1.6),
    }, {
      x: position.x + randomBetween(-.2, .2),
      y: position.y + randomBetween(.2, .3),
      z: position.z + randomBetween(-.24, .24),
    }, true);
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    const previous = previousHalfWidth.current;
    previousHalfWidth.current = halfWidth;
    const body = rigidBodyRef.current;
    if (!body || previous === halfWidth) return;
    // Contain the die on viewport resize only; never rescale its momentum.
    const limit = halfWidth - DIE_RADIUS - .08;
    const position = body.translation();
    if (Math.abs(position.x) > limit) body.setTranslation({ ...position, x: THREE.MathUtils.clamp(position.x, -limit, limit) }, true);
    invalidate();
  }, [halfWidth, invalidate]);

  useEffect(() => {
    if (isRolling) setLaunched(true);
  }, [isRolling]);

  useEffect(() => {
    if (!launched || !isRolling) return;
    if (rollNonce <= 0) return;
    if (rollNonce === lastRollNonceRef.current) return;
    const rafId = window.requestAnimationFrame(() => {
      lastRollNonceRef.current = rollNonce;
      tossDie();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [rollNonce, tossDie, launched, isRolling]);

  const onImpact = useCallback(() => { if (isRolling) impact.current = 1; }, [isRolling]);

  useFrame(({ clock, camera, size }, delta) => {
    const progress = isRolling ? Math.min(1, (Date.now() - rollNonce) / Math.max(1, duration)) : 1;
    const settle = THREE.MathUtils.smoothstep(progress, .58, .96);
    // Only lighting is animated here. Rapier alone
    // owns the trajectory and decides when the body has come to rest.
    if (isRolling) invalidate();
    if (meshRef.current) {
      meshRef.current.getWorldPosition(projectedPosition);
      const lift = Math.max(0, projectedPosition.y - FLOOR_Y - DIE_RADIUS);
      projectedPosition.project(camera);
      const x = projectedPosition.x * size.width / 2;
      stageRef.current?.style.setProperty('--dice-x', `${x}px`);
      stageRef.current?.style.setProperty('--dice-y', `${-projectedPosition.y * size.height / 2 - headroom / 2}px`);
      stageRef.current?.style.setProperty('--dice-shadow-scale', String(1 + lift * .3));
      stageRef.current?.style.setProperty('--dice-shadow-opacity', String(Math.max(.2, .7 - lift * .3)));
    }
    impact.current = Math.max(0, impact.current - delta * 4);
    const energy = isRolling ? 1 - settle : 0;
    const pulse = .3 + energy * (.18 + Math.sin(clock.elapsedTime * 5) * .06) + impact.current * .1;
    const edgePulse = .75 + energy * .15 + impact.current * .1;
    if (shellMaterialRef.current) {
      shellMaterialRef.current.emissiveIntensity = pulse;
    }
    if (coreMaterialRef.current) {
      coreMaterialRef.current.emissiveIntensity = pulse * 0.8;
    }
    if (edgeMaterialRef.current) {
      edgeMaterialRef.current.opacity = Math.min(1, edgePulse);
    }
    if (edgeAccentMaterialRef.current) {
      edgeAccentMaterialRef.current.opacity = Math.min(0.95, edgePulse * 0.9);
      edgeAccentMaterialRef.current.dashSize = 0.07 + edgePulse * 0.045;
      edgeAccentMaterialRef.current.gapSize = 0.045 + edgePulse * 0.03;
    }
    if (edgeEtchMaterialRef.current) {
      edgeEtchMaterialRef.current.opacity = 0.2 + edgePulse * 0.18;
    }
    if (edgeGlowMaterialRef.current) {
      edgeGlowMaterialRef.current.opacity = 0.14 + edgePulse * 0.08;
    }
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type={launched ? 'dynamic' : 'fixed'}
      colliders="hull"
      ccd
      restitution={0.62}
      friction={0.65}
      linearDamping={0.12}
      angularDamping={0.18}
      canSleep
      onCollisionEnter={onImpact}
    >
      <mesh ref={meshRef} name="dice-shell" geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color="#9b83db"
          emissive="#5b39d4"
          emissiveIntensity={0.3}
          roughness={0.14}
          metalness={0.38}
          clearcoat={1}
          clearcoatRoughness={0.08}
          iridescence={0.5}
          iridescenceIOR={1.3}
          iridescenceThicknessRange={[120, 420]}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          ref={coreMaterialRef}
          color="#8ee8ff"
          emissive="#4338ca"
          emissiveIntensity={0.22}
          roughness={0.5}
          metalness={0.14}
          transparent
          opacity={0.16}
          side={THREE.BackSide}
        />
      </mesh>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial ref={edgeEtchMaterialRef} color="#1d103f" transparent opacity={0.32} />
      </lineSegments>
      <lineSegments geometry={edgesGeometry} scale={[1.006, 1.006, 1.006]}>
        <lineBasicMaterial ref={edgeMaterialRef} color="#e9ddff" transparent opacity={0.82} />
      </lineSegments>
      <lineSegments geometry={edgesGeometry} scale={[1.02, 1.02, 1.02]}>
        <lineBasicMaterial
          ref={edgeGlowMaterialRef}
          color="#8de8ff"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments ref={edgeAccentRef} geometry={edgesGeometry} scale={[1.012, 1.012, 1.012]}>
        <lineDashedMaterial
          ref={edgeAccentMaterialRef}
          color="#93f1ff"
          transparent
          opacity={0.72}
          dashSize={0.1}
          gapSize={0.06}
          scale={1.6}
        />
      </lineSegments>
      <DiceNumber3D value={displayValue} isRolling={isRolling} />
    </RigidBody>
  );
}

function DiceArena(props: DiceSceneProps) {
  const { camera, size, invalidate } = useThree();
  // The canvas extends one stage-height above the chat entry. Keep the same
  // world-to-pixel scale and floor position while exposing that extra airspace.
  const view = useMemo(() => getDiceView(size.width, size.height / 2, size.height / 2), [size.width, size.height]);
  useLayoutEffect(() => {
    fitDiceCamera(camera as THREE.OrthographicCamera, view);
    invalidate();
  }, [camera, view, invalidate]);
  // Leave a fixed gutter beyond the collision walls for every rotating edge.
  const halfWidth = view.wallHalfWidth;
  return <>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfWidth, WALL_THICKNESS, CHAMBER_HALF_DEPTH]} position={[0, FLOOR_Y - WALL_THICKNESS, 0]} restitution={.58} friction={.8} />
      <CuboidCollider args={[WALL_THICKNESS, RAIL_HALF_HEIGHT, CHAMBER_HALF_DEPTH]} position={[-halfWidth - WALL_THICKNESS, RAIL_CENTER_Y, 0]} restitution={.5} friction={.55} />
      <CuboidCollider args={[WALL_THICKNESS, RAIL_HALF_HEIGHT, CHAMBER_HALF_DEPTH]} position={[halfWidth + WALL_THICKNESS, RAIL_CENTER_Y, 0]} restitution={.5} friction={.55} />
      <CuboidCollider args={[halfWidth, RAIL_HALF_HEIGHT, WALL_THICKNESS]} position={[0, RAIL_CENTER_Y, -CHAMBER_HALF_DEPTH - WALL_THICKNESS]} restitution={.45} friction={.55} />
      <CuboidCollider args={[halfWidth, RAIL_HALF_HEIGHT, WALL_THICKNESS]} position={[0, RAIL_CENTER_Y, CHAMBER_HALF_DEPTH + WALL_THICKNESS]} restitution={.45} friction={.55} />
    </RigidBody>
    <DiceBody {...props} halfWidth={halfWidth} headroom={view.headroom} />
  </>;
}

export default function TroubleDice3D({ rollNonce, isRolling, displayValue, duration, active, stageRef }: TroubleDice3DProps) {
  const camera = useMemo(createDiceCamera, []);
  return (
    <span className="cosmic-three-dice-shell" aria-hidden="true">
      <span className="cosmic-three-dice-canvas-wrap">
        <Canvas
          frameloop={active ? 'demand' : 'never'}
          className="cosmic-three-dice-canvas"
          orthographic
          camera={camera}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          shadows={false}
        >
          <ambientLight intensity={0.34} />
          <hemisphereLight intensity={0.72} color="#b28cff" groundColor="#143f4f" />
          <directionalLight position={[3.2, 4.4, 2.2]} intensity={1.12} color="#f2f6ff" />
          <directionalLight position={[-2.6, 1.8, -3.2]} intensity={0.52} color="#7dd3fc" />
          <pointLight position={[0, 0.8, 1.6]} intensity={1.1} color="#8b5cf6" distance={6} />

          <Physics gravity={[0, -18, 0]} timeStep={1 / 60} paused={!active}>
            <DiceArena rollNonce={rollNonce} isRolling={isRolling} duration={duration} displayValue={displayValue} stageRef={stageRef} />
          </Physics>
        </Canvas>
      </span>
    </span>
  );
}
