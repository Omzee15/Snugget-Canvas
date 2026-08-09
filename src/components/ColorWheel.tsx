import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string; // hex, e.g. "#17181b"
  onChange: (hex: string) => void;
}

const SIZE = 160;
const RADIUS = SIZE / 2;

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// A draggable hue/saturation disc (angle = hue, distance from center =
// saturation) plus a lightness slider — canvas-rendered so the disc doesn't
// need 360 individual DOM nodes.
export function ColorWheel({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsl, setHsl] = useState(() => hexToHsl(value));
  const draggingRef = useRef(false);

  // Re-sync from external changes (e.g. clicking a preset swatch) without
  // fighting the user's own in-progress drag.
  useEffect(() => {
    if (draggingRef.current) return;
    setHsl(hexToHsl(value));
  }, [value]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - RADIUS;
        const dy = y - RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * SIZE + x) * 4;
        if (dist > RADIUS) {
          img.data[i + 3] = 0;
          continue;
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const hue = (angle + 360) % 360;
        const sat = Math.min(1, dist / RADIUS);
        const hex = hslToHex(hue, sat, 0.5);
        img.data[i] = parseInt(hex.slice(1, 3), 16);
        img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[i + 3] = 255;
      }
    }
    createImageBitmap(img).then((bitmap) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
      bitmap.close();
    });
  }, []);

  const pickAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - RADIUS;
    const y = clientY - rect.top - RADIUS;
    const dist = Math.min(RADIUS, Math.sqrt(x * x + y * y));
    const angle = (Math.atan2(y, x) * 180) / Math.PI;
    const hue = (angle + 360) % 360;
    const sat = dist / RADIUS;
    setHsl((prev) => {
      const next = { h: hue, s: sat, l: prev.l };
      onChange(hslToHex(next.h, next.s, next.l));
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    pickAt(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    pickAt(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const dotX = RADIUS + Math.cos((hsl.h * Math.PI) / 180) * hsl.s * RADIUS;
  const dotY = RADIUS + Math.sin((hsl.h * Math.PI) / 180) * hsl.s * RADIUS;

  const setLightness = (l: number) => {
    setHsl((prev) => {
      const next = { ...prev, l };
      onChange(hslToHex(next.h, next.s, next.l));
      return next;
    });
  };

  return (
    <div className="wheel-container">
      <div className="wheel-disc-wrap" style={{ width: SIZE, height: SIZE }}>
        <canvas
          ref={canvasRef}
          className="wheel-disc"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <div className="wheel-dot" style={{ left: dotX, top: dotY }} />
      </div>
      <input
        className="wheel-lightness"
        type="range"
        min={0}
        max={100}
        value={Math.round(hsl.l * 100)}
        onChange={(e) => setLightness(Number(e.target.value) / 100)}
        style={{
          background: `linear-gradient(to right, ${hslToHex(hsl.h, hsl.s, 0)}, ${hslToHex(hsl.h, hsl.s, 0.5)}, ${hslToHex(hsl.h, hsl.s, 1)})`
        }}
      />
    </div>
  );
}
