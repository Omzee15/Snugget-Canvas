// Local, offline-safe app icon: a deterministic colored initial badge.
// Nothing here touches the network — earlier this used Google's favicon
// service (https://www.google.com/s2/favicons), which meant every icon in
// the palette/wheel/favorites went blank without a connection.
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#4f8ef7', '#8b5cf6', '#ec4899'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function colorForSeed(seed: string): string {
  return PALETTE[hashString(seed) % PALETTE.length];
}

export function initialFor(name: string): string {
  const trimmed = name.trim().replace(/^https?:\/\//, '').replace(/^www\./, '');
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

export function FallbackIcon({
  name,
  size = 28,
  className
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`fallback-icon${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: colorForSeed(name), fontSize: size * 0.5 }}
    >
      {initialFor(name)}
    </div>
  );
}
