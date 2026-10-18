import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { createDieGeometry, getDieRestPose } from '../../utils/diceGeometry';
import DiceNumber3D from './DiceNumber3D';
import DieAppearance, { type DieFeedback, type DiePointerHandlers } from './DieAppearance';
import { useDiePress } from './useDiePress';
import type { DieBodyProps } from './types';

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

/** One solid die: grounded spawn, one initial impulse, then natural physics. */
export default function DieBody({ die, rollNonce, isRolling, duration, lightRef, halfWidth, headroom, radius, floorY, spawn, canActivate, onActivate, eventSource, motion }: DieBodyProps) {
  const geometry = useMemo(() => createDieGeometry(die.kind, radius), [die.kind, radius]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const pose = useMemo(() => getDieRestPose(geometry, floorY, spawn[0], spawn[1], .35 + die.kind.toString().length * .17), [geometry, floorY, spawn, die.kind]);
  const initialPose = useRef(pose);
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const position = useMemo(() => new THREE.Vector3(), []);
  const shadow = useMemo(() => new THREE.Vector3(), []);
  const feedback = useRef<DieFeedback>({ hovered: false, pressed: false, impact: 0 });
  const [launched, setLaunched] = useState(isRolling || die.value !== undefined);
  const lastNonce = useRef(isRolling ? 0 : rollNonce);
  const previousWidth = useRef(halfWidth);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => () => { geometry.dispose(); edges.dispose(); }, [geometry, edges]);
  useEffect(() => {
    if (!launched && body.current) {
      body.current.setTranslation({ x: pose.position[0], y: pose.position[1], z: pose.position[2] }, false);
      body.current.setRotation({ x: pose.quaternion[0], y: pose.quaternion[1], z: pose.quaternion[2], w: pose.quaternion[3] }, false);
      invalidate();
    }
  }, [pose, launched, invalidate]);

  const pressFeedback = useCallback((pressed: boolean) => {
    feedback.current.pressed = pressed;
    if (pressed) feedback.current.impact = 1;
    if (lightRef.current) lightRef.current.dataset.pressed = String(pressed);
    invalidate();
  }, [lightRef, invalidate]);
  const press = useDiePress(canActivate && !isRolling, onActivate, pressFeedback);
  const handlers: DiePointerHandlers = {
    onPointerOver: event => {
      if (!canActivate || isRolling) return;
      event.stopPropagation();
      feedback.current.hovered = true;
      if (eventSource.current) {
        eventSource.current.dataset.hoveredDie = die.id;
        eventSource.current.style.cursor = 'pointer';
      }
      invalidate();
    },
    onPointerOut: () => {
      feedback.current.hovered = false;
      press.cancel();
      if (eventSource.current?.dataset.hoveredDie === die.id) {
        eventSource.current.style.cursor = '';
        delete eventSource.current.dataset.hoveredDie;
      }
      invalidate();
    },
    onPointerDown: event => { event.stopPropagation(); press.down(event); },
    onPointerMove: event => press.move(event),
    onPointerUp: event => { event.stopPropagation(); press.up(event); },
    onPointerCancel: () => press.cancel(),
  };
  useEffect(() => {
    const source = eventSource.current;
    const clear = () => {
      if (source?.dataset.hoveredDie === die.id) { source.style.cursor = ''; delete source.dataset.hoveredDie; }
    };
    if (!canActivate) clear();
    return clear;
  }, [canActivate, eventSource, die.id]);

  const toss = useCallback(() => {
    const rigidBody = body.current;
    if (!rigidBody) return;
    feedback.current.impact = 1;
    const start = rigidBody.translation();
    rigidBody.wakeUp();
    const mass = rigidBody.mass();
    const direction = Math.random() < .5 ? -1 : 1;
    rigidBody.applyImpulseAtPoint({
      x: direction * mass * randomBetween(9.5, 12.5),
      y: mass * randomBetween(9, 11),
      z: mass * randomBetween(-1.6, 1.6),
    }, {
      x: start.x + randomBetween(-.2, .2),
      y: start.y + randomBetween(.2, .3),
      z: start.z + randomBetween(-.24, .24),
    }, true);
    invalidate();
  }, [invalidate]);
  useEffect(() => { if (isRolling) setLaunched(true); }, [isRolling]);
  useEffect(() => {
    if (!launched || !isRolling || !motion || rollNonce <= 0 || rollNonce === lastNonce.current) return;
    const frame = requestAnimationFrame(() => { lastNonce.current = rollNonce; toss(); });
    return () => cancelAnimationFrame(frame);
  }, [launched, isRolling, motion, rollNonce, toss]);
  useEffect(() => {
    const previous = previousWidth.current;
    previousWidth.current = halfWidth;
    if (!body.current || previous === halfWidth || !launched) return;
    const limit = halfWidth - radius - .08;
    const current = body.current.translation();
    if (Math.abs(current.x) > limit) body.current.setTranslation({ ...current, x: THREE.MathUtils.clamp(current.x, -limit, limit) }, true);
    invalidate();
  }, [halfWidth, radius, launched, invalidate]);

  useFrame(({ camera, size }) => {
    if (!mesh.current || !lightRef.current) return;
    mesh.current.getWorldPosition(position);
    const lift = Math.max(0, position.y - floorY - pose.height);
    shadow.set(position.x, floorY, position.z).project(camera);
    position.project(camera);
    const light = lightRef.current.style;
    light.setProperty('--dice-x', `${position.x * size.width / 2}px`);
    light.setProperty('--dice-y', `${-position.y * size.height / 2 - headroom / 2}px`);
    light.setProperty('--dice-shadow-x', `${shadow.x * size.width / 2}px`);
    light.setProperty('--dice-shadow-y', `${-shadow.y * size.height / 2 - headroom / 2}px`);
    light.setProperty('--dice-shadow-scale', String(1 + lift * .3));
    light.setProperty('--dice-shadow-opacity', String(Math.max(.2, .7 - lift * .3)));
    const orthographic = camera as THREE.OrthographicCamera;
    light.setProperty('--dice-hit-size', `${radius * 2 * size.height / (orthographic.top - orthographic.bottom) + 12}px`);
  });

  return <RigidBody ref={body} name={`die:${die.id}`} position={initialPose.current.position} quaternion={initialPose.current.quaternion}
    type={launched ? 'dynamic' : 'fixed'} colliders="hull" ccd restitution={.62} friction={.65}
    linearDamping={.12} angularDamping={.18} canSleep onCollisionEnter={() => { if (isRolling) feedback.current.impact = 1; }}>
    <DieAppearance kind={die.kind} geometry={geometry} edges={edges} meshRef={mesh} feedback={feedback} handlers={handlers}
      isRolling={isRolling} rollNonce={rollNonce} duration={duration} motion={motion} />
    {die.value !== undefined && <DiceNumber3D value={die.value} isRolling={isRolling} rollNonce={rollNonce} radius={radius} />}
  </RigidBody>;
}
