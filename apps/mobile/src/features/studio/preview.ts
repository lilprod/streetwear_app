import { ImageFormat, Skia, type CanvasRef } from '@shopify/react-native-skia';
import { PREVIEW_MAX_BASE64_CHARS } from './sync';

const WIDTHS = [480, 360, 240];

export function capturePreview(canvas: CanvasRef | null): string | null {
  const snapshot = canvas?.makeImageSnapshot();
  if (!snapshot) return null;
  for (const w of WIDTHS) {
    const h = Math.round((snapshot.height() * w) / snapshot.width());
    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) continue;
    surface
      .getCanvas()
      .drawImageRect(
        snapshot,
        Skia.XYWHRect(0, 0, snapshot.width(), snapshot.height()),
        Skia.XYWHRect(0, 0, w, h),
        Skia.Paint(),
      );
    surface.flush();
    const encoded = surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100);
    if (encoded.length <= PREVIEW_MAX_BASE64_CHARS) return encoded;
  }
  return null;
}
