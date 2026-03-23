import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
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

function DiceBody({ rollNonce }: Pick<TroubleDice3DProps, 'rollNonce'>) {
  const rigidBodyRef = useRef<RapierRigidBody | null>(null);
  const lastRollNonceRef = useRef(0);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.68, 0), []);
  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

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
          color="#7de7d5"
          roughness={0.24}
          metalness={0.15}
          clearcoat={0.42}
          clearcoatRoughness={0.18}
        />
      </mesh>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color="#0e4f47" transparent opacity={0.56} />
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
          <ambientLight intensity={0.72} />
          <directionalLight position={[3.4, 4.2, 2.1]} intensity={1.22} />
          <directionalLight position={[-2.4, 1.4, -3]} intensity={0.48} color="#8bd6ff" />

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

            <DiceBody rollNonce={rollNonce} />
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
