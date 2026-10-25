import { expect, it } from 'vitest';
import { advanceSpring, containSpring, springAtRest } from './springPhysics';

const material = { mass: 1.2, stiffness: 125, damping: 10 };
it('conserves position when an impulse is added and then accelerates toward equilibrium', () => {
  const spring = { position: 0, velocity: 75 };
  advanceSpring(spring, 1 / 60, material);
  expect(spring.position).toBeGreaterThan(0);
  expect(spring.velocity).toBeLessThan(75);
  const before = spring.position;
  spring.velocity += 75;
  expect(spring.position).toBe(before);
  advanceSpring(spring, 1 / 60, material);
  expect(spring.position).toBeGreaterThan(before);
});
it('produces the same trajectory at 30, 60, and 144 Hz', () => {
  const trajectories = [30, 60, 144].map(rate => {
    const spring = { position: 3, velocity: 75 };
    for (let frame = 0; frame < rate; frame++) advanceSpring(spring, 1 / rate, material);
    return spring;
  });
  for (const spring of trajectories) {
    expect(spring.position).toBeCloseTo(trajectories[0].position, 9);
    expect(spring.velocity).toBeCloseTo(trajectories[0].velocity, 9);
  }
});
it.each([10, 20, 30])('dissipates energy and settles with damping %s', damping => {
  const spring = { position: 1, velocity: 10 };
  const settings = { mass: 1, stiffness: 100, damping };
  let previousEnergy = .5 * spring.velocity ** 2 + .5 * settings.stiffness * spring.position ** 2;
  for (let frame = 0; frame < 1200; frame++) {
    advanceSpring(spring, 1 / 120, settings);
    const energy = .5 * spring.velocity ** 2 + .5 * settings.stiffness * spring.position ** 2;
    expect(energy).toBeLessThanOrEqual(previousEnergy + 1e-8);
    previousEnergy = energy;
  }
  expect(springAtRest(spring)).toBe(true);
});
it('keeps momentum finite at the portrait boundary and reflects only outward velocity', () => {
  const spring = { position: 24, velocity: 100 };
  containSpring(spring, 20);
  expect(spring).toEqual({ position: 20, velocity: -20 });
  const returning = { position: 24, velocity: -100 };
  containSpring(returning, 20);
  expect(returning).toEqual({ position: 20, velocity: -100 });
});
