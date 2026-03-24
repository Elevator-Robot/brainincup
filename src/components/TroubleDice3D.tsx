import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

type TroubleDice3DProps = {
  rollNonce: number;
  isRolling: boolean;
  displayValue: string;
  pulseId: number;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const CHAMBER_HALF_WIDTH = 2.12;
const CHAMBER_HALF_HEIGHT = 1.26;
const CHAMBER_HALF_DEPTH = 1.82;
const WALL_THICKNESS = 0.14;
const FLOOR_Y = -CHAMBER_HALF_HEIGHT;
const CEILING_Y = CHAMBER_HALF_HEIGHT;

function DiceBody({ rollNonce, isRolling }: Pick<TroubleDice3DProps, 'rollNonce' | 'isRolling'>) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const lastRollNonceRef = useRef(0);
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const edgeMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeAccentMaterialRef = useRef<THREE.LineDashedMaterial | null>(null);
  const edgeEtchMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeGlowMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeAccentRef = useRef<THREE.LineSegments | null>(null);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.68, 0), []);
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

    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.setTranslation({ x: randomBetween(-0.2, 0.2), y: 0.74, z: randomBetween(-0.2, 0.2) }, true);
    body.setRotation(rotation, true);
    body.wakeUp();
    body.applyImpulse(
      {
        x: randomBetween(-1.9, 1.9),
        y: randomBetween(4.2, 5.6),
        z: randomBetween(-1.9, 1.9),
      },
      true,
    );
    body.applyTorqueImpulse(
      {
        x: randomBetween(-24, 24),
        y: randomBetween(-24, 24),
        z: randomBetween(-24, 24),
      },
      true,
    );
  }, []);

  useEffect(() => {
    if (rollNonce <= 0) return;
    if (rollNonce === lastRollNonceRef.current) return;
    lastRollNonceRef.current = rollNonce;

    const rafId = window.requestAnimationFrame(() => {
      tossDie();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [rollNonce, tossDie]);

  useFrame(({ clock }) => {
    const pulse = 0.3 + Math.sin(clock.elapsedTime * 2.7) * 0.07 + (isRolling ? 0.14 : 0);
    const edgePulse = 0.62 + Math.sin(clock.elapsedTime * 4.2) * 0.17 + (isRolling ? 0.18 : 0);
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
      colliders="hull"
      ccd
      restitution={0.78}
      friction={0.22}
      linearDamping={0.12}
      angularDamping={0.14}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color="#d7deff"
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
    </RigidBody>
  );
}

export default function TroubleDice3D({ rollNonce, isRolling, displayValue, pulseId }: TroubleDice3DProps) {
  return (
    <span className="retro-three-dice-shell" aria-hidden="true">
      <span className="retro-three-dice-canvas-wrap">
        <Canvas
          className="retro-three-dice-canvas"
          camera={{ position: [0, 0.72, 4.1], fov: 36 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: true }}
          shadows={false}
        >
          <ambientLight intensity={0.34} />
          <hemisphereLight intensity={0.72} color="#b28cff" groundColor="#143f4f" />
          <directionalLight position={[3.2, 4.4, 2.2]} intensity={1.12} color="#f2f6ff" />
          <directionalLight position={[-2.6, 1.8, -3.2]} intensity={0.52} color="#7dd3fc" />
          <pointLight position={[0, 0.8, 1.6]} intensity={1.1} color="#8b5cf6" distance={6} />

          <Physics gravity={[0, -22, 0]} timeStep={1 / 120}>
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider
                args={[CHAMBER_HALF_WIDTH, WALL_THICKNESS, CHAMBER_HALF_DEPTH]}
                position={[0, FLOOR_Y - WALL_THICKNESS, 0]}
                restitution={0.7}
                friction={0.62}
              />
              <CuboidCollider
                args={[CHAMBER_HALF_WIDTH, WALL_THICKNESS, CHAMBER_HALF_DEPTH]}
                position={[0, CEILING_Y + WALL_THICKNESS, 0]}
                restitution={0.68}
                friction={0.58}
              />
              <CuboidCollider
                args={[WALL_THICKNESS, CHAMBER_HALF_HEIGHT, CHAMBER_HALF_DEPTH]}
                position={[-CHAMBER_HALF_WIDTH - WALL_THICKNESS, 0, 0]}
                restitution={0.68}
                friction={0.55}
              />
              <CuboidCollider
                args={[WALL_THICKNESS, CHAMBER_HALF_HEIGHT, CHAMBER_HALF_DEPTH]}
                position={[CHAMBER_HALF_WIDTH + WALL_THICKNESS, 0, 0]}
                restitution={0.68}
                friction={0.55}
              />
              <CuboidCollider
                args={[CHAMBER_HALF_WIDTH, CHAMBER_HALF_HEIGHT, WALL_THICKNESS]}
                position={[0, 0, -CHAMBER_HALF_DEPTH - WALL_THICKNESS]}
                restitution={0.68}
                friction={0.55}
              />
              <CuboidCollider
                args={[CHAMBER_HALF_WIDTH, CHAMBER_HALF_HEIGHT, WALL_THICKNESS]}
                position={[0, 0, CHAMBER_HALF_DEPTH + WALL_THICKNESS]}
                restitution={0.68}
                friction={0.55}
              />
            </RigidBody>

            <DiceBody rollNonce={rollNonce} isRolling={isRolling} />
          </Physics>
        </Canvas>
      </span>

      <span
        key={`dice-value-${pulseId}`}
        className={`retro-roll-panel-value-badge ${isRolling ? 'retro-roll-panel-value-badge--rolling' : ''}`}
      >
        {displayValue}
      </span>
    </span>
  );
}
