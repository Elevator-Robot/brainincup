import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { getDieNumberOpacity } from './presentation';

const TEXTURE_SIZE = 256;
const NUMBER_FONT = '700 148px Cinzel, Georgia, serif';

/** A camera-facing numeral attached to the rigid body, rendered with the die. */
export default function DiceNumber3D({ value, isRolling, rollNonce, radius }: { value: string; isRolling: boolean; rollNonce: number; radius: number }) {
  const numberScale = radius * 1.05;
  const sprite = useRef<THREE.Sprite>(null);
  const material = useRef<THREE.SpriteMaterial>(null);
  const wasRolling = useRef(isRolling);
  const revealStarted = useRef<number | null>(null);
  const invalidate = useThree(state => state.invalidate);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
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
      context.lineWidth = 4;
      context.strokeStyle = 'rgba(20, 14, 38, .65)';
      context.shadowColor = 'rgba(10, 8, 28, .75)';
      context.shadowBlur = 5;
      context.shadowOffsetY = 2;
      context.strokeText(value, x, y);
      context.shadowBlur = context.shadowOffsetY = 0;
      context.fillStyle = '#fff3d5';
      context.fillText(value, x, y);
      texture.needsUpdate = true;
      invalidate();
    };
    paint();
    if (document.fonts && !document.fonts.check('700 148px Cinzel', value)) {
      void document.fonts.load('700 148px Cinzel', value).then(paint, () => {});
    }
    return () => { mounted = false; };
  }, [texture, value, invalidate]);

  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    if (reducedMotion) {
      revealStarted.current = null;
      sprite.current?.scale.setScalar(numberScale);
    } else if (wasRolling.current && !isRolling) {
      revealStarted.current = performance.now();
      invalidate();
    }
    wasRolling.current = isRolling;
  }, [isRolling, reducedMotion, numberScale, invalidate]);
  useFrame(() => {
    if (sprite.current && material.current) {
      const alpha = isRolling && !reducedMotion
        ? getDieNumberOpacity(Date.now() - rollNonce)
        : 1;
      material.current.opacity = alpha;
      sprite.current.visible = alpha > 0;
      if (isRolling && alpha < 1) invalidate();
    }
    if (revealStarted.current === null || !sprite.current) return;
    const progress = Math.min(1, (performance.now() - revealStarted.current) / 420);
    sprite.current.scale.setScalar(numberScale * (1 + .1 * Math.sin(Math.PI * progress)));
    if (progress < 1) invalidate();
    else revealStarted.current = null;
  });

  return <sprite ref={sprite} name="dice-number" scale={numberScale} renderOrder={10} visible={!isRolling || reducedMotion}>
    <spriteMaterial ref={material} map={texture} opacity={isRolling && !reducedMotion ? 0 : 1} transparent depthTest={false} depthWrite={false} toneMapped={false} />
  </sprite>;
}
