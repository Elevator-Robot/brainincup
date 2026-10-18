import { describe, expect, it } from 'vitest';
import { EdgesGeometry, Quaternion, Vector3 } from 'three';
import { createDieGeometry, getDieRestPose } from './diceGeometry';
import { DIE_RADIUS } from './diceCamera';
import type { DieKind } from '../game/dice';

const shapes: Array<[DieKind, number, number, number]> = [
  [4, 4, 6, 3], [6, 6, 12, 4], [8, 8, 12, 3], [10, 10, 20, 4],
  [12, 12, 30, 5], [20, 20, 30, 3], ['percentile', 10, 20, 4],
];

describe('polyhedral dice meshes', () => {
  it.each(shapes)('rests die %s on a flat face without levitation or floor penetration', (kind, _faces, _edges, cornersPerFace) => {
    const geometry = createDieGeometry(kind);
    const floor = -1.45;
    const pose = getDieRestPose(geometry, floor, 2, -.5);
    const rotation = new Quaternion().fromArray(pose.quaternion);
    const contacts = new Set<string>();
    try {
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        const vertex = new Vector3().fromBufferAttribute(geometry.attributes.position, i).applyQuaternion(rotation).add(new Vector3(...pose.position));
        expect(vertex.y).toBeGreaterThanOrEqual(floor - .000001);
        if (Math.abs(vertex.y - floor) < .000001) contacts.add(vertex.toArray().map(value => value.toFixed(5)).join(','));
      }
      expect(contacts.size).toBe(cornersPerFace);
    } finally { geometry.dispose(); }
  });

  it.each(shapes)('creates die %s with the correct planar faces and edges', (kind, faceCount, edgeCount, cornersPerFace) => {
    const geometry = createDieGeometry(kind);
    const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
    const edges = new EdgesGeometry(geometry);
    try {
      const positions = mesh.attributes.position;
      const faces: Array<{ normal: Vector3; distance: number; vertices: Set<string>; area: number }> = [];
      for (let i = 0; i < positions.count; i += 3) {
        const triangle = [0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, i + offset));
        const cross = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
        const area = cross.length() / 2;
        const normal = cross.normalize();
        const distance = normal.dot(triangle[0]);
        expect(area).toBeGreaterThan(0);
        expect(distance).toBeGreaterThan(0); // All faces point outward.
        let face = faces.find(candidate => candidate.normal.dot(normal) > .999999 && Math.abs(candidate.distance - distance) < .00001);
        if (!face) { face = { normal, distance, vertices: new Set(), area: 0 }; faces.push(face); }
        face.area += area;
        triangle.forEach(vertex => {
          expect(vertex.length()).toBeLessThanOrEqual(DIE_RADIUS + .000001);
          face.vertices.add(vertex.toArray().map(value => value.toFixed(5)).join(','));
        });
      }
      expect(faces).toHaveLength(faceCount);
      expect(edges.attributes.position.count / 2).toBe(edgeCount);
      for (const face of faces) {
        expect(face.vertices.size).toBe(cornersPerFace);
        expect(face.area).toBeCloseTo(faces[0].area, 5);
      }
    } finally {
      if (mesh !== geometry) mesh.dispose();
      geometry.dispose();
      edges.dispose();
    }
  });
});
