import { describe, expect, it } from 'vitest';
import { Euler, IcosahedronGeometry, Quaternion, Vector3 } from 'three';
import { createDiceCamera, fitDiceCamera, getDiceView, DIE_RADIUS, DICE_ARENA_HALF_HEIGHT } from './diceCamera';

describe('rigid dice projection', () => {
  it('adds open airspace without changing die size or its original screen position', () => {
    const width = 880;
    const height = 240;
    const camera = createDiceCamera();
    const expandedCamera = createDiceCamera();
    fitDiceCamera(camera, getDiceView(width, height));
    fitDiceCamera(expandedCamera, getDiceView(width, height, height));
    for (const position of [new Vector3(0, 0, 0), new Vector3(3, -.6, .3), new Vector3(-3, 2.5, -.3)]) {
      const before = position.clone().project(camera);
      const after = position.clone().project(expandedCamera);
      expect((1 - after.y) * height - height).toBeCloseTo((1 - before.y) * height / 2, 10);
      expect(after.x).toBeCloseTo(before.x, 10);
    }
    const highPoint = new Vector3(0, DICE_ARENA_HALF_HEIGHT + DIE_RADIUS, 0).project(expandedCamera);
    expect(highPoint.y).toBeLessThan(1);
    expect(highPoint.y).toBeGreaterThan(-1);
  });

  it.each([[880, 240], [362, 224], [1600, 240], [180, 224]])(
    'keeps the same shape at both walls and all depths in a %i × %i viewport', (width, height) => {
      const camera = createDiceCamera();
      const view = getDiceView(width, height);
      fitDiceCamera(camera, view);
      expect(camera.isOrthographicCamera).toBe(true);
      const geometry = new IcosahedronGeometry(DIE_RADIUS, 0);
      try {
        for (const angles of [[0, 0, 0], [.4, .7, .2], [1.1, 2.3, -.8]]) {
          const rotation = new Quaternion().setFromEuler(new Euler(angles[0], angles[1], angles[2]));
          const vertices = Array.from({ length: geometry.attributes.position.count }, (_, index) =>
            new Vector3().fromBufferAttribute(geometry.attributes.position, index).applyQuaternion(rotation));
          const rightContact = view.wallHalfWidth - Math.max(...vertices.map(vertex => vertex.x));
          const leftContact = -view.wallHalfWidth - Math.min(...vertices.map(vertex => vertex.x));
          let expectedWidth: number | undefined;
          let expectedHeight: number | undefined;
          for (const x of [0, leftContact, rightContact]) {
            for (const z of [-.33, 0, .33]) {
              const projected = vertices.map(vertex => vertex.clone().add(new Vector3(x, 0, z)).project(camera));
              const projectedWidth = Math.max(...projected.map(point => point.x)) - Math.min(...projected.map(point => point.x));
              const projectedHeight = Math.max(...projected.map(point => point.y)) - Math.min(...projected.map(point => point.y));
              expectedWidth ??= projectedWidth;
              expectedHeight ??= projectedHeight;
              expect(projectedWidth).toBeCloseTo(expectedWidth, 10);
              expect(projectedHeight).toBeCloseTo(expectedHeight, 10);
              // Include the outer glow geometry, which extends 2% past the hull.
              for (const y of [-DICE_ARENA_HALF_HEIGHT - Math.min(...vertices.map(vertex => vertex.y)), DICE_ARENA_HALF_HEIGHT - Math.max(...vertices.map(vertex => vertex.y))]) {
                for (const vertex of vertices) {
                  const edge = vertex.clone().multiplyScalar(1.02).add(new Vector3(x, y, z)).project(camera);
                  expect(Math.abs(edge.x)).toBeLessThan(1);
                  expect(Math.abs(edge.y)).toBeLessThan(1);
                }
              }
            }
          }
        }
      } finally {
        geometry.dispose();
      }
    },
  );
});
