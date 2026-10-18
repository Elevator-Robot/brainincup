import type { RefObject } from 'react';
import type { VisualDie } from '../../game/dice';

export interface DieRollMotion {
  rollNonce: number;
  isRolling: boolean;
  duration: number;
}

export interface DiceSceneProps extends DieRollMotion {
  dice: readonly VisualDie[];
  rollStates?: Readonly<Record<string, DieRollMotion>>;
  active: boolean;
  motion?: boolean;
  collection?: boolean;
  stageRef: RefObject<HTMLSpanElement>;
  canActivate?: boolean;
  onDieActivate?: (id: string) => void;
  actionLabel?: string | ((die: VisualDie, rolling: boolean) => string);
}

export const getDieMotion = (scene: DiceSceneProps, id: string): DieRollMotion => scene.rollStates?.[id] ?? scene;

export interface DieBodyProps {
  die: VisualDie;
  rollNonce: number;
  isRolling: boolean;
  duration: number;
  lightRef: RefObject<HTMLSpanElement>;
  halfWidth: number;
  headroom: number;
  radius: number;
  floorY: number;
  spawn: [number, number];
  canActivate: boolean;
  onActivate: () => void;
  eventSource: RefObject<HTMLSpanElement>;
  motion: boolean;
}
