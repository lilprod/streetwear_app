export type Geo = { cx: number; cy: number; w: number; h: number; rot: number };
export type ZoneDims = { w: number; h: number };
export type ScaleLimits = { minScale: number; maxScale: number };
export type Transform = { dx: number; dy: number; scale: number; dRot: number };

export function normalizeRotation(deg: number): number {
  'worklet';
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export function rotatedExtent(w: number, h: number, rotDeg: number): { bw: number; bh: number } {
  'worklet';
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { bw: w * c + h * s, bh: w * s + h * c };
}

export function applyTransform(base: Geo, t: Transform, lim: ScaleLimits, zone: ZoneDims): Geo {
  'worklet';
  const rot = normalizeRotation(base.rot + t.dRot);
  const ext = rotatedExtent(base.w, base.h, rot);
  const fit = Math.min(zone.w / ext.bw, zone.h / ext.bh);
  const wanted = Math.max(t.scale, lim.minScale);
  const s = Math.min(wanted, lim.maxScale, fit);
  const w = base.w * s;
  const h = base.h * s;
  const e = rotatedExtent(w, h, rot);
  const halfW = e.bw / 2;
  const halfH = e.bh / 2;
  const cx = Math.min(Math.max(base.cx + t.dx, halfW), zone.w - halfW);
  const cy = Math.min(Math.max(base.cy + t.dy, halfH), zone.h - halfH);
  return { cx, cy, w, h, rot };
}

export function hitTest(geo: Geo, px: number, py: number): boolean {
  'worklet';
  const rad = (-geo.rot * Math.PI) / 180;
  const dx = px - geo.cx;
  const dy = py - geo.cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= geo.w / 2 && Math.abs(ly) <= geo.h / 2;
}
