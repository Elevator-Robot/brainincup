import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { OrthographicCamera } from 'three';
import { fitDiceCamera, getDiceView, DIE_RADIUS, DICE_ARENA_HALF_HEIGHT } from '../../utils/diceCamera';
import DieBody from './DieBody';
import { getDieMotion, type DiceSceneProps } from './types';
import type { RefObject } from 'react';

interface DiceArenaProps extends DiceSceneProps {
  getLightRef: (id: string) => RefObject<HTMLSpanElement>;
}

/** Camera, spawn layout, and an open-topped physical table. */
export default function DiceArena(props: DiceArenaProps) {
  const { camera, size, invalidate } = useThree();
  const radius = props.collection ? .62 : DIE_RADIUS;
  const columns = props.collection ? Math.min(props.dice.length, Math.max(1, Math.floor(size.width / 140))) : props.dice.length;
  const rows = Math.ceil(props.dice.length / columns);
  const floorY = props.collection ? 0 : -DICE_ARENA_HALF_HEIGHT;
  const depth = props.collection ? Math.max(1.15, (rows - 1) * .8 + radius + .5) : 1.15;
  const view = useMemo(() => getDiceView(size.width, size.height / 2, size.height / 2, props.collection
    ? Math.max(DICE_ARENA_HALF_HEIGHT + .22, (rows * 1.6 + .6) / 2, (columns * 1.45 + .6) / (2 * size.width / (size.height / 2)))
    : undefined), [size.width, size.height, columns, rows, props.collection]);
  useLayoutEffect(() => {
    if (props.collection) {
      camera.position.set(0, floorY + 6, 6);
      camera.lookAt(0, floorY, 0);
    }
    fitDiceCamera(camera as OrthographicCamera, view);
    invalidate();
  }, [camera, view, invalidate, props.collection, floorY]);
  const halfWidth = view.wallHalfWidth;
  const spawns = useMemo(() => {
    const pitch = Math.min(props.collection ? 1.75 : 2, (2 * halfWidth - 2 * radius - .2) / Math.max(1, columns - 1));
    return Array.from({ length: props.dice.length }, (_, index): [number, number] => {
      const row = Math.floor(index / columns);
      const count = Math.min(columns, props.dice.length - row * columns);
      return [(index % columns - (count - 1) / 2) * pitch, props.collection ? (row - (rows - 1) / 2) * 1.6 : 0];
    });
  }, [halfWidth, radius, columns, rows, props.dice.length, props.collection]);
  const railHeight = (100 - floorY) / 2;
  const railCenter = (100 + floorY) / 2;

  return <>
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[halfWidth, .14, depth]} position={[0, floorY - .14, 0]} restitution={.58} friction={.8} />
      <CuboidCollider args={[.14, railHeight, depth]} position={[-halfWidth - .14, railCenter, 0]} restitution={.5} friction={.55} />
      <CuboidCollider args={[.14, railHeight, depth]} position={[halfWidth + .14, railCenter, 0]} restitution={.5} friction={.55} />
      <CuboidCollider args={[halfWidth, railHeight, .14]} position={[0, railCenter, -depth - .14]} restitution={.45} friction={.55} />
      <CuboidCollider args={[halfWidth, railHeight, .14]} position={[0, railCenter, depth + .14]} restitution={.45} friction={.55} />
    </RigidBody>
    {props.dice.map((die, index) => {
      const roll = getDieMotion(props, die.id);
      return <DieBody key={die.id} die={die} rollNonce={roll.rollNonce} isRolling={roll.isRolling} duration={roll.duration}
        lightRef={props.dice.length === 1 ? props.stageRef : props.getLightRef(die.id)} eventSource={props.stageRef}
        halfWidth={halfWidth} headroom={view.headroom} radius={radius} floorY={floorY} spawn={spawns[index]}
        motion={props.motion ?? true}
        canActivate={Boolean(props.canActivate && !roll.isRolling)} onActivate={() => props.onDieActivate?.(die.id)} />;
    })}
  </>;
}
