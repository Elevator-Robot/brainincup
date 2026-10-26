export interface Spring { position: number; velocity: number }
export interface SpringMaterial { mass: number; stiffness: number; damping: number }

/** Exact solution to m*x'' + c*x' + k*x = 0, not a sampled easing curve.
 * Retaining velocity makes impulses accumulate and keeps motion frame-rate
 * independent. Handles under-, over-, and critically damped materials. */
export function advanceSpring(spring: Spring, seconds: number, material: SpringMaterial): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const { position: x, velocity: v } = spring;
  const alpha = material.damping / (2 * material.mass);
  const omega2 = material.stiffness / material.mass;
  const difference = omega2 - alpha * alpha;
  if (Math.abs(difference) < 1e-8) {
    const decay = Math.exp(-alpha * seconds);
    const b = v + alpha * x;
    spring.position = decay * (x + b * seconds);
    spring.velocity = decay * (v - alpha * b * seconds);
  } else if (difference > 0) {
    const omega = Math.sqrt(difference);
    const decay = Math.exp(-alpha * seconds);
    const cosine = Math.cos(omega * seconds);
    const sine = Math.sin(omega * seconds);
    spring.position = decay * (x * cosine + (v + alpha * x) / omega * sine);
    spring.velocity = decay * (v * cosine - (alpha * v + omega2 * x) / omega * sine);
  } else {
    const root = Math.sqrt(-difference);
    const a = (v + (alpha + root) * x) / (2 * root);
    const b = x - a;
    const first = a * Math.exp((-alpha + root) * seconds);
    const second = b * Math.exp((-alpha - root) * seconds);
    spring.position = first + second;
    spring.velocity = (-alpha + root) * first + (-alpha - root) * second;
  }
}

export const springAtRest = (spring: Spring) => Math.abs(spring.position) < .005 && Math.abs(spring.velocity) < .025;

/** A low-restitution boundary keeps accumulated pokes inside the portrait. */
export function containSpring(spring: Spring, limit: number): void {
  if (Math.abs(spring.position) <= limit) return;
  spring.position = Math.sign(spring.position) * limit;
  if (spring.position * spring.velocity > 0) spring.velocity *= -.2;
}
