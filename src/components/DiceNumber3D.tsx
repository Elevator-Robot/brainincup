import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const TEXTURE_SIZE = 256;
const NUMBER_SCALE = .95;
const NUMBER_FONT = '700 160px Nunito, system-ui, sans-serif';

/** A camera-facing numeral attached to the rigid body, rendered with the die. */
export default function DiceNumber3D({ value, isRolling }: { value: string; isRolling: boolean }) {
  const sprite = useRef<THREE.Sprite>(null);
  const wasRolling = useRef(isRolling);
  const revealStarted = useRef<number | null>(null);
  const invalidate = useThree(state => state.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEXTURE_SIZE;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    return map;
  }, []);

  useLayoutEffect(() => {
    let mounted = true;
    const paint = () => {
      if (!mounted) return;
      const canvas = texture.image as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      context.font = NUMBER_FONT;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      const metrics = context.measureText(value);
      const x = TEXTURE_SIZE / 2 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
      const y = TEXTURE_SIZE / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.lineJoin = 'round';
      context.lineWidth = 8;
      context.strokeStyle = 'rgba(13, 9, 31, .8)';
      context.shadowColor = 'rgba(10, 8, 28, .9)';
      context.shadowBlur = 10;
      context.shadowOffsetY = 3;
      context.strokeText(value, x, y);
      context.shadowBlur = context.shadowOffsetY = 0;
      context.fillStyle = '#fbfaff';
      context.fillText(value, x, y);
      texture.needsUpdate = true;
      invalidate();
    };
    paint();
    if (document.fonts && !document.fonts.check('700 160px Nunito', value)) {
      void document.fonts.load('700 160px Nunito', value).then(paint, () => {});
    }
    return () => { mounted = false; };
  }, [texture, value, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    if (wasRolling.current && !isRolling) {
      revealStarted.current = performance.now();
      invalidate();
    }
    wasRolling.current = isRolling;
  }, [isRolling, invalidate]);
  useFrame(() => {
    if (revealStarted.current === null || !sprite.current) return;
    const progress = Math.min(1, (performance.now() - revealStarted.current) / 420);
    sprite.current.scale.setScalar(NUMBER_SCALE * (1 + .1 * Math.sin(Math.PI * progress)));
    if (progress < 1) invalidate();
    else revealStarted.current = null;
  });

  return <sprite ref={sprite} name="dice-number" scale={NUMBER_SCALE} renderOrder={10}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
  </sprite>;
}
