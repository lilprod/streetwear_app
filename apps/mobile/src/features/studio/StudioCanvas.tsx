import { memo, useEffect, useMemo, type RefObject } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  DashPathEffect,
  Group,
  Image as SkiaImage,
  ImageShader,
  Path,
  Rect,
  Text as SkiaText,
  useImage,
  type CanvasRef,
  type SkFont,
} from '@shopify/react-native-skia';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type {
  Font,
  Layer,
  Pattern,
  PatternLayer,
  TextLayer,
  TshirtColor,
} from '@streetwear/shared';
import { applyTransform, hitTest, type Geo, type ScaleLimits } from './gestureMath';
import { geoOfLayer, layersOf, scaleLimits, zoneDims, type Content, type Side } from './model';
import { SHIRT_H_MM, SHIRT_W_MM, shirtPath, zoneOrigin } from './shirt';
import type { StudioFonts } from './useStudioFonts';
import { FONT_BASE_SIZE } from './useStudioFonts';

const MM_PER_PX_300DPI = 25.4 / 300;

type GeoEntry = { id: string; geo: Geo; lim: ScaleLimits };
type Live = SharedValue<Geo | null>;
type LiveId = SharedValue<string>;

type Props = {
  width: number;
  side: Side;
  content: Content;
  colors: TshirtColor[];
  patternsById: Record<string, Pattern>;
  fonts: Font[];
  skFonts: StudioFonts;
  selectedId: string | null;
  canvasRef: RefObject<CanvasRef | null>;
  onSelect: (id: string | null) => void;
  onGestureStart: () => void;
  onGestureCommit: (id: string, geo: Geo) => void;
  label: string;
};

export function StudioCanvas({
  width,
  side,
  content,
  colors,
  patternsById,
  fonts,
  skFonts,
  selectedId,
  canvasRef,
  onSelect,
  onGestureStart,
  onGestureCommit,
  label,
}: Props) {
  const k = width / SHIRT_W_MM;
  const height = SHIRT_H_MM * k;
  const zone = zoneDims(side);
  const origin = zoneOrigin(side);
  const layers = layersOf(content, side);
  const shirtColor = colors.find((c) => c.id === content.colorId)?.hex ?? '#FFFFFF';

  const live: Live = useSharedValue<Geo | null>(null);
  const liveId: LiveId = useSharedValue('');
  const base = useSharedValue<Geo>({ cx: 0, cy: 0, w: 1, h: 1, rot: 0 });
  const limits = useSharedValue<ScaleLimits>({ minScale: 0, maxScale: Infinity });
  const entries = useSharedValue<GeoEntry[]>([]);
  const selId = useSharedValue<string | null>(null);
  const sessions = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0);
  const framing = useSharedValue(0);

  useEffect(() => {
    entries.value = layers.map((l) => ({ id: l.id, geo: geoOfLayer(l), lim: scaleLimits(l) }));
  }, [layers, entries]);
  useEffect(() => {
    selId.value = selectedId;
  }, [selectedId, selId]);

  const clearLive = () => {
    requestAnimationFrame(() => {
      live.value = null;
      liveId.value = '';
    });
  };
  const commit = (id: string, geo: Geo) => {
    onGestureCommit(id, geo);
    clearLive();
  };

  const startSession = () => {
    'worklet';
    if (sessions.value === 0) {
      const entry = entries.value.find((e) => e.id === selId.value);
      tx.value = 0;
      ty.value = 0;
      sc.value = 1;
      rot.value = 0;
      if (entry) {
        base.value = entry.geo;
        limits.value = entry.lim;
        live.value = entry.geo;
        liveId.value = entry.id;
        framing.value = withTiming(1, { duration: 120 });
        runOnJS(onGestureStart)();
      }
    }
    sessions.value += 1;
  };

  const refresh = () => {
    'worklet';
    if (!live.value) return;
    live.value = applyTransform(
      base.value,
      { dx: tx.value / k, dy: ty.value / k, scale: sc.value, dRot: rot.value },
      limits.value,
      zone,
    );
  };

  const endSession = () => {
    'worklet';
    sessions.value = Math.max(0, sessions.value - 1);
    if (sessions.value > 0) return;
    framing.value = withTiming(0, { duration: 200 });
    const geo = live.value;
    const moved = tx.value !== 0 || ty.value !== 0 || sc.value !== 1 || rot.value !== 0;
    if (geo && moved) {
      runOnJS(commit)(liveId.value, geo);
    } else if (geo) {
      runOnJS(clearLive)();
    }
  };

  const pick = (x: number, y: number): string | null => {
    'worklet';
    const px = x / k - origin.x;
    const py = y / k - origin.y;
    const list = entries.value;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      if (e && hitTest(e.geo, px, py)) return e.id;
    }
    return null;
  };

  const pan = usePanGesture({
    minDistance: 2,
    onBegin: (e) => {
      'worklet';
      if (sessions.value === 0) {
        const hit = pick(e.x, e.y);
        if (hit && hit !== selId.value) {
          selId.value = hit;
          runOnJS(onSelect)(hit);
        }
      }
      startSession();
    },
    onUpdate: (e) => {
      'worklet';
      tx.value = e.translationX;
      ty.value = e.translationY;
      refresh();
    },
    onFinalize: () => {
      'worklet';
      endSession();
    },
  });
  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      startSession();
    },
    onUpdate: (e) => {
      'worklet';
      sc.value = e.scale;
      refresh();
    },
    onFinalize: () => {
      'worklet';
      endSession();
    },
  });
  const twist = useRotationGesture({
    onBegin: () => {
      'worklet';
      startSession();
    },
    onUpdate: (e) => {
      'worklet';
      rot.value = (e.rotation * 180) / Math.PI;
      refresh();
    },
    onFinalize: () => {
      'worklet';
      endSession();
    },
  });
  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      const hit = pick(e.x, e.y);
      runOnJS(onSelect)(hit);
    },
  });
  const gesture = useSimultaneousGestures(tap, pan, pinch, twist);

  const frameOpacity = useDerivedValue(() => framing.value);

  const shirt = shirtPath(side);

  return (
    <GestureDetector gesture={gesture}>
      <View accessible accessibilityLabel={label} style={{ width, height }} collapsable={false}>
        <Canvas ref={canvasRef} style={{ width, height }}>
          <Group transform={[{ scale: k }]}>
            <Path path={shirt} color={shirtColor} />
            <Path path={shirt} style="stroke" strokeWidth={1.5 / k} color="rgba(0,0,0,0.14)" />
            <Group transform={[{ translateX: origin.x }, { translateY: origin.y }]}>
              {layers.map((layer) => (
                <LayerView
                  key={layer.id}
                  layer={layer}
                  pattern={layer.type === 'pattern' ? patternsById[layer.patternId] : undefined}
                  font={
                    layer.type === 'text'
                      ? (skFonts[fonts.find((f) => f.id === layer.fontId)?.family ?? ''] ?? null)
                      : null
                  }
                  live={live}
                  liveId={liveId}
                />
              ))}
            </Group>
          </Group>
        </Canvas>
        <View pointerEvents="none" style={{ position: 'absolute', width, height }}>
          <Canvas style={{ width, height }}>
            <Group transform={[{ scale: k }, { translateX: origin.x }, { translateY: origin.y }]}>
              <Group opacity={frameOpacity}>
                <Rect
                  x={0}
                  y={0}
                  width={zone.w}
                  height={zone.h}
                  style="stroke"
                  strokeWidth={2 / k}
                  color="#0A0A0A"
                >
                  <DashPathEffect intervals={[10 / k, 6 / k]} />
                </Rect>
              </Group>
              {layers.map((layer) =>
                layer.id === selectedId ? (
                  <SelectionFrame key={layer.id} layer={layer} live={live} liveId={liveId} k={k} />
                ) : null,
              )}
            </Group>
          </Canvas>
        </View>
      </View>
    </GestureDetector>
  );
}

function useLiveTransform(layer: Layer, live: Live, liveId: LiveId) {
  const staticGeo = useMemo(() => geoOfLayer(layer), [layer]);
  const transform = useDerivedValue(() => {
    const g = liveId.value === layer.id && live.value ? live.value : staticGeo;
    return [
      { translateX: g.cx },
      { translateY: g.cy },
      { rotate: (g.rot * Math.PI) / 180 },
      { scale: g.w / staticGeo.w },
    ];
  }, [staticGeo, layer.id]);
  return { staticGeo, transform };
}

const LayerView = memo(function LayerView({
  layer,
  pattern,
  font,
  live,
  liveId,
}: {
  layer: Layer;
  pattern: Pattern | undefined;
  font: SkFont | null;
  live: Live;
  liveId: LiveId;
}) {
  const { staticGeo, transform } = useLiveTransform(layer, live, liveId);
  return (
    <Group transform={transform}>
      {layer.type === 'pattern' ? (
        <PatternView layer={layer} pattern={pattern} w={staticGeo.w} h={staticGeo.h} />
      ) : (
        <TextView layer={layer} font={font} />
      )}
    </Group>
  );
});

function PatternView({
  layer,
  pattern,
  w,
  h,
}: {
  layer: PatternLayer;
  pattern: Pattern | undefined;
  w: number;
  h: number;
}) {
  const image = useImage(pattern?.previewUrl ?? null);
  if (!image) {
    return <Rect x={-w / 2} y={-h / 2} width={w} height={h} color="rgba(110,110,115,0.35)" />;
  }
  if (layer.repeat === 'tile') {
    const moduleMm = (pattern?.widthPx ?? image.width()) * MM_PER_PX_300DPI * layer.tileScale;
    return (
      <Rect x={-w / 2} y={-h / 2} width={w} height={h}>
        <ImageShader
          image={image}
          tx="repeat"
          ty="repeat"
          fit="none"
          rect={{ x: 0, y: 0, width: image.width(), height: image.height() }}
          transform={[{ scale: moduleMm / image.width() }]}
        />
      </Rect>
    );
  }
  return <SkiaImage image={image} x={-w / 2} y={-h / 2} width={w} height={h} fit="fill" />;
}

function TextView({ layer, font }: { layer: TextLayer; font: SkFont | null }) {
  const metrics = useMemo(() => {
    if (!font) return null;
    const cap = font.measureText('H').height || FONT_BASE_SIZE * 0.7;
    return { cap, width: font.measureText(layer.text).width };
  }, [font, layer.text]);
  if (!font || !metrics) return null;
  const s = layer.sizeMm / metrics.cap;
  return (
    <Group transform={[{ scale: s }]}>
      <SkiaText
        text={layer.text}
        font={font}
        x={-metrics.width / 2}
        y={metrics.cap / 2}
        color={layer.colorHex}
      />
    </Group>
  );
}

function SelectionFrame({
  layer,
  live,
  liveId,
  k,
}: {
  layer: Layer;
  live: Live;
  liveId: LiveId;
  k: number;
}) {
  const { staticGeo, transform } = useLiveTransform(layer, live, liveId);
  return (
    <Group transform={transform}>
      <Rect
        x={-staticGeo.w / 2}
        y={-staticGeo.h / 2}
        width={staticGeo.w}
        height={staticGeo.h}
        style="stroke"
        strokeWidth={1.5 / k}
        color="#0066CC"
      />
    </Group>
  );
}
