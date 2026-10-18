import { BoxGeometry, BufferGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry, OctahedronGeometry, Quaternion, TetrahedronGeometry, Vector3 } from 'three';
import type { DieKind } from '../game/dice';
import { DIE_RADIUS } from './diceCamera';

/** Ten congruent, planar kite faces—not a ten-triangle bipyramid. */
function pentagonalTrapezohedron(radius: number): BufferGeometry {
  const ringHeight = Math.tan(Math.PI / 10) ** 2;
  const vertices = [new Vector3(0, 1, 0), new Vector3(0, -1, 0)];
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    vertices.push(new Vector3(Math.cos(angle), i % 2 ? -ringHeight : ringHeight, Math.sin(angle)));
  }
  const scale = radius / Math.sqrt(1 + ringHeight ** 2);
  vertices.forEach(vertex => vertex.multiplyScalar(scale));
  const positions: number[] = [];
  for (let i = 0; i < 10; i++) {
    const face = [i % 2 ? 1 : 0, 2 + i, 2 + (i + 1) % 10, 2 + (i + 2) % 10];
    const [a, b, c] = face.map(index => vertices[index]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const center = face.reduce((sum, index) => sum.add(vertices[index]), new Vector3()).multiplyScalar(.25);
    if (normal.dot(center) < 0) face.reverse();
    for (let triangle = 1; triangle < face.length - 1; triangle++) {
      for (const index of [face[0], face[triangle], face[triangle + 1]]) positions.push(...vertices[index].toArray());
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createDieGeometry(kind: DieKind, radius = DIE_RADIUS): BufferGeometry {
  switch (kind) {
  case 4: return new TetrahedronGeometry(radius, 0);
  case 6: {
    const edge = 2 * radius / Math.sqrt(3);
    return new BoxGeometry(edge, edge, edge);
  }
  case 8: return new OctahedronGeometry(radius, 0);
  case 10:
  case 'percentile': return pentagonalTrapezohedron(radius);
  case 12: return new DodecahedronGeometry(radius, 0);
  case 20: return new IcosahedronGeometry(radius, 0);
  }
}

/** Place a real face on the floor, with a small yaw for a readable resting pose. */
export function getDieRestPose(geometry: BufferGeometry, floorY: number, x = 0, z = 0, yaw = .35) {
  const positions = geometry.attributes.position;
  const vertex = (index: number) => new Vector3().fromBufferAttribute(positions, geometry.index ? geometry.index.getX(index) : index);
  const a = vertex(0);
  const normal = vertex(1).sub(a).cross(vertex(2).sub(a)).normalize();
  const orientation = new Quaternion().setFromUnitVectors(normal, new Vector3(0, -1, 0));
  orientation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
  let minimumY = Infinity;
  for (let index = 0; index < positions.count; index++) {
    minimumY = Math.min(minimumY, new Vector3().fromBufferAttribute(positions, index).applyQuaternion(orientation).y);
  }
  return {
    position: [x, floorY - minimumY, z] as [number, number, number],
    quaternion: orientation.toArray() as [number, number, number, number],
    height: -minimumY,
  };
}
