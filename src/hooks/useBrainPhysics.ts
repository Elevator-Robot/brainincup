import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { advanceSpring, containSpring, springAtRest, type Spring } from '../utils/springPhysics';

const createBody = () => ({ x: { position: 0, velocity: 0 }, y: { position: 0, velocity: 0 }, turn: { position: 0, velocity: 0 }, squash: { position: 0, velocity: 0 } });
const FLOAT = { mass: 1.2, stiffness: 125, damping: 10 };
const JELLY = { mass: .8, stiffness: 210, damping: 8 };
const kick = (spring: Spring, impulse: number, maxVelocity: number) => {
  spring.velocity = Math.max(-maxVelocity, Math.min(maxVelocity, spring.velocity + impulse));
};

export function useBrainPhysics(body: RefObject<HTMLSpanElement>, contact: RefObject<HTMLSpanElement>, enabled: boolean) {
  const simulation = useRef(createBody());
  const frame = useRef(0);
  const last = useRef<number | null>(null);
  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0; last.current = null;
    simulation.current = createBody();
    body.current?.style.removeProperty('transform');
    body.current?.removeAttribute('data-physics');
    contact.current?.style.removeProperty('opacity');
  }, [body, contact]);
  useEffect(() => {
    if (!enabled) reset();
    return reset;
  }, [enabled, reset]);

  return useCallback((x: number, y: number) => {
    if (!enabled || !body.current) return;
    const state = simulation.current;
    // Off-center pokes impart torque as well as translation. Velocity, rather
    // than position, changes instantly: a second poke never teleports the body.
    kick(state.x, (.5 - x) * 190, 280);
    kick(state.y, (.5 - y) * 150 + 75, 280);
    kick(state.turn, (x - .5) * 100, 150);
    kick(state.squash, -1.7, 4.5);
    body.current.dataset.physics = 'active';
    if (contact.current) contact.current.style.opacity = '.4';
    if (frame.current) return;
    last.current = null;
    const integrate = (now: number) => {
      // Ignore wall-time spent stalled/hidden instead of catching up violently.
      const seconds = last.current === null ? 1 / 60 : Math.max(0, Math.min(64, now - last.current)) / 1000;
      last.current = now;
      const springs = simulation.current;
      advanceSpring(springs.x, seconds, FLOAT);
      advanceSpring(springs.y, seconds, FLOAT);
      advanceSpring(springs.turn, seconds, FLOAT);
      advanceSpring(springs.squash, seconds, JELLY);
      containSpring(springs.x, 18); containSpring(springs.y, 20);
      containSpring(springs.turn, 8); containSpring(springs.squash, .13);
      if (!body.current || Object.values(springs).every(springAtRest)) { reset(); return; }
      const scale = 1 + springs.squash.position;
      body.current.style.transform = `translate3d(${springs.x.position.toFixed(3)}px, ${springs.y.position.toFixed(3)}px, 0) rotate(${springs.turn.position.toFixed(3)}deg) scale(${scale.toFixed(4)}, ${(1 / scale).toFixed(4)})`;
      // Approximate volume conservation couples squash and stretch; contact
      // light decays with actual deformation/velocity, not a fixed timer.
      if (contact.current) contact.current.style.opacity = String(Math.min(.6, Math.abs(springs.squash.position) * 5 + Math.abs(springs.squash.velocity) * .05));
      frame.current = requestAnimationFrame(integrate);
    };
    frame.current = requestAnimationFrame(integrate);
  }, [body, contact, enabled, reset]);
}
