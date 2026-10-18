import { OrthographicCamera } from 'three';

export const DIE_RADIUS = .82;
export const DICE_ARENA_HALF_HEIGHT = 1.45;
const EDGE_GUTTER = .22;

export function getDiceView(width: number, height: number, headroom = 0) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const halfHeight = Math.max(DICE_ARENA_HALF_HEIGHT + EDGE_GUTTER, (DIE_RADIUS + .45 + EDGE_GUTTER) / aspect);
  const halfWidth = halfHeight * aspect;
  const unitsPerPixel = halfHeight * 2 / Math.max(1, height);
  return {
    halfWidth, halfHeight, wallHalfWidth: halfWidth - EDGE_GUTTER, headroom,
    top: halfHeight + headroom * unitsPerPixel,
    bottom: -halfHeight,
  };
}

export function createDiceCamera() {
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 100) as OrthographicCamera & { manual: boolean };
  // The scene sets world-space bounds; R3F must not replace them with pixel bounds.
  camera.manual = true;
  camera.position.set(0, 0, 4.8);
  return camera;
}

export function fitDiceCamera(camera: OrthographicCamera, view: ReturnType<typeof getDiceView>) {
  camera.left = -view.halfWidth;
  camera.right = view.halfWidth;
  camera.top = view.top;
  camera.bottom = view.bottom;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
