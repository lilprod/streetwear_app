import { createStore } from 'zustand/vanilla';
import type { Pattern, PatternLayer, TshirtColor } from '@streetwear/shared';
import type { Geo } from './gestureMath';
import {
  contentToSpec,
  findLayer,
  layerWithGeo,
  mapLayer,
  newLayerId,
  removeLayer,
  setColor as setContentColor,
  setPattern,
  setText as setContentText,
  sideOfLayer,
  transformLayer,
  updatePattern,
  type Content,
  type Side,
  type TextPatch,
} from './model';

export const HISTORY_LIMIT = 30;

export type StudioState = {
  content: Content;
  side: Side;
  selectedId: string | null;
  past: Content[];
  future: Content[];
  lastKey: string | null;
  gestureBase: Content | null;
  colorsById: Record<string, TshirtColor>;
  localId: string;
  serverId: string | null;
  name: string | null;
};

export type StudioActions = {
  load: (input: {
    content: Content;
    localId?: string;
    serverId?: string | null;
    name?: string | null;
  }) => void;
  setColors: (colors: TshirtColor[]) => void;
  setSide: (side: Side) => void;
  select: (id: string | null) => void;
  chooseColor: (color: TshirtColor) => void;
  choosePattern: (pattern: Pick<Pattern, 'id'>) => void;
  setPatternOptions: (patch: Partial<Pick<PatternLayer, 'repeat' | 'tileScale'>>) => void;
  editText: (patch: TextPatch, defaults: { fontId: string; colorHex: string; side?: Side }) => void;

  removeSelected: () => void;
  beginGesture: () => void;
  commitGesture: (id: string, geo: Geo) => void;
  nudge: (dxMm: number, dyMm: number) => void;
  scaleBy: (factor: number) => void;
  rotateBy: (deg: number) => void;
  undo: () => void;
  redo: () => void;
};

export type StudioStore = StudioState & StudioActions;

const initialState = (colorId: string): StudioState => ({
  content: { colorId, front: [], back: [] },
  side: 'front',
  selectedId: null,
  past: [],
  future: [],
  lastKey: null,
  gestureBase: null,
  colorsById: {},
  localId: newLayerId(),
  serverId: null,
  name: null,
});

export function createStudioStore(defaultColorId = 'col-noir', makeId: () => string = newLayerId) {
  return createStore<StudioStore>()((set, get) => {
    const commit = (next: Content, key: string | null = null) => {
      const s = get();
      if (next === s.content) return;
      const coalesce = key !== null && key === s.lastKey;
      set({
        content: next,
        past: coalesce ? s.past : [...s.past, s.content].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: key,
      });
    };

    const withSelected = (fn: (id: string, content: Content) => Content, key: string | null) => {
      const { selectedId, content } = get();
      if (!selectedId || !findLayer(content, selectedId)) return;
      commit(fn(selectedId, content), key);
    };

    return {
      ...initialState(defaultColorId),

      load: ({ content, localId, serverId, name }) =>
        set({
          ...initialState(content.colorId),
          colorsById: get().colorsById,
          content,
          localId: localId ?? newLayerId(),
          serverId: serverId ?? null,
          name: name ?? null,
        }),

      setColors: (colors) => set({ colorsById: Object.fromEntries(colors.map((c) => [c.id, c])) }),

      setSide: (side) => set({ side, selectedId: null }),

      select: (selectedId) => set({ selectedId }),

      chooseColor: (color) => {
        const { content, colorsById } = get();
        if (content.colorId === color.id) return;
        commit(setContentColor(content, color, colorsById[content.colorId]));
      },

      choosePattern: (pattern) => {
        const { content, side } = get();
        const res = setPattern(content, side, pattern, makeId);
        commit(res.content);
        set({ selectedId: res.layerId });
      },

      setPatternOptions: (patch) => {
        const { content, side } = get();
        commit(updatePattern(content, side, patch), patch.tileScale === undefined ? null : 'tile');
      },

      editText: (patch, defaults) => {
        const { content, side } = get();
        const res = setContentText(content, defaults.side ?? side, patch, defaults, makeId);
        if (!res) return;
        commit(
          res.content,
          patch.text !== undefined ? 'text' : patch.sizeMm !== undefined ? 'size' : null,
        );
        set({ selectedId: res.layerId });
      },

      removeSelected: () => {
        const { selectedId, content } = get();
        if (!selectedId) return;
        commit(removeLayer(content, selectedId));
        set({ selectedId: null });
      },

      beginGesture: () => set({ gestureBase: get().content }),

      commitGesture: (id, geo) => {
        const { content, gestureBase } = get();
        const next = mapLayer(content, id, (l) => layerWithGeo(l, geo));
        if (next === content) {
          set({ gestureBase: null });
          return;
        }
        const base = gestureBase ?? content;
        set({
          content: next,
          past: [...get().past, base].slice(-HISTORY_LIMIT),
          future: [],
          lastKey: null,
          gestureBase: null,
        });
      },

      nudge: (dx, dy) =>
        withSelected(
          (id, c) =>
            mapLayer(c, id, (l, side) => transformLayer(l, side, { dx, dy, scale: 1, dRot: 0 })),
          null,
        ),

      scaleBy: (factor) =>
        withSelected(
          (id, c) =>
            mapLayer(c, id, (l, side) =>
              transformLayer(l, side, { dx: 0, dy: 0, scale: factor, dRot: 0 }),
            ),
          null,
        ),

      rotateBy: (deg) =>
        withSelected(
          (id, c) =>
            mapLayer(c, id, (l, side) =>
              transformLayer(l, side, { dx: 0, dy: 0, scale: 1, dRot: deg }),
            ),
          null,
        ),

      undo: () => {
        const { past, content, future, selectedId } = get();
        const previous = past[past.length - 1];
        if (!previous) return;
        set({
          content: previous,
          past: past.slice(0, -1),
          future: [content, ...future],
          lastKey: null,
          selectedId: selectedId && findLayer(previous, selectedId) ? selectedId : null,
        });
      },

      redo: () => {
        const { past, content, future, selectedId } = get();
        const next = future[0];
        if (!next) return;
        set({
          content: next,
          past: [...past, content].slice(-HISTORY_LIMIT),
          future: future.slice(1),
          lastKey: null,
          selectedId: selectedId && findLayer(next, selectedId) ? selectedId : null,
        });
      },
    };
  });
}

export const studioStore = createStudioStore();

export const selectSpec = (s: Pick<StudioState, 'content'>) => contentToSpec(s.content);
export const selectCanUndo = (s: StudioState) => s.past.length > 0;
export const selectCanRedo = (s: StudioState) => s.future.length > 0;
export const selectedSide = (s: StudioState) =>
  s.selectedId ? sideOfLayer(s.content, s.selectedId) : null;
