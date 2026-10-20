import {
  FIXTURE_COLORS,
  FIXTURE_DESIGNS,
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  VALID_DESIGNS,
  computeUnitPriceXof,
  containsBannedWord,
  uid,
  validateDesignSpec,
  type DesignSpec,
  type Layer,
  type TshirtColor,
} from '@streetwear/shared';
import { createMockApi, MOCK_BANNED_WORDS } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { createMemoryStorage } from '../../storage/storage';
import { loadCatalog } from './catalog';
import { createDraftsRepo, type DraftRecord } from './drafts';
import { applyTransform, hitTest } from './gestureMath';
import { contentFromSpec, contentToSpec, geoOfLayer, layersOf, textLayerOf } from './model';
import { HISTORY_LIMIT, createStudioStore, selectSpec } from './store';
import { syncDrafts } from './sync';

const black = FIXTURE_COLORS[0] as TshirtColor;
const white = FIXTURE_COLORS[1] as TshirtColor;
const sand = FIXTURE_COLORS[2] as TshirtColor;

function makeStore(colorId = 'col-noir') {
  let n = 0;
  const store = createStudioStore(colorId, () => uid(++n));
  store.getState().setColors(FIXTURE_COLORS);
  return store;
}

const assertValid = (store: ReturnType<typeof makeStore>) => {
  const spec = selectSpec(store.getState());
  if (spec) expect(validateDesignSpec(spec).ok).toBe(true);
  return spec;
};

const ids = (spec: DesignSpec | null | undefined) =>
  JSON.parse(JSON.stringify(spec ?? null).replace(/"id":"[^"]+"/g, '"id":"-"'));

describe('store: DesignSpec production', () => {
  it('rebuilds the 3 reference designs from user actions', () => {
    const a = makeStore('col-noir');
    a.getState().choosePattern({ id: 'pat-kente-ewe' });
    a.getState().commitGesture(uid(1), { cx: 145, cy: 165, w: 250, h: 250, rot: 0 });
    expect(ids(selectSpec(a.getState()))).toEqual(ids(VALID_DESIGNS.patternOnly));

    const b = makeStore('col-sable');
    b.getState().choosePattern({ id: 'pat-losanges' });
    b.getState().commitGesture(uid(1), { cx: 140, cy: 140, w: 200, h: 200, rot: 15 });
    b.getState().editText(
      { text: 'LOMÉ 228', colorHex: '#FFFFFF' },
      { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'front' },
    );
    expect(ids(selectSpec(b.getState()))).toEqual(ids(VALID_DESIGNS.patternAndText));

    const c = makeStore('col-indigo');
    c.getState().choosePattern({ id: 'pat-wax-be' });
    c.getState().commitGesture(uid(1), { cx: 148.5, cy: 210, w: 297, h: 420, rot: 0 });
    c.getState().setPatternOptions({ repeat: 'tile', tileScale: 0.5 });
    c.getState().setSide('back');
    c.getState().choosePattern({ id: 'pat-soleil' });
    c.getState().commitGesture(uid(2), { cx: 148.5, cy: 148.5, w: 200, h: 297, rot: 90 });
    expect(ids(selectSpec(c.getState()))).toEqual(ids(VALID_DESIGNS.frontBackTiled));
  });

  it('round-trips fixtures through the content model', () => {
    for (const d of FIXTURE_DESIGNS) {
      expect(contentToSpec(contentFromSpec(d.spec))).toEqual(d.spec);
    }
  });

  it('keeps every state valid after any operation', () => {
    const s = makeStore();
    const g = s.getState;
    g().choosePattern({ id: 'pat-bogolan' });
    assertValid(s);
    for (let i = 0; i < 40; i += 1) {
      g().rotateBy(15);
      g().scaleBy(1.1);
      g().nudge(500, -500);
      assertValid(s);
    }
    g().editText(
      { text: 'ABCDEFGHIJKLMN', sizeMm: 80 },
      { fontId: 'font-anton', colorHex: '#FFFFFF' },
    );
    const spec = assertValid(s);
    const text = spec && textLayerOf(contentFromSpec(spec));
    expect(text?.sizeMm).toBeLessThanOrEqual(80);
    for (let i = 0; i < 24; i += 1) {
      g().rotateBy(15);
      g().scaleBy(1.2);
      assertValid(s);
    }
  });

  it('allows one pattern per zone and one text per design', () => {
    const s = makeStore();
    const g = s.getState;
    g().choosePattern({ id: 'pat-bogolan' });
    g().choosePattern({ id: 'pat-bandes' });
    expect(layersOf(g().content, 'front')).toHaveLength(1);
    g().editText({ text: 'LOMÉ' }, { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'back' });
    g().setSide('front');
    g().editText({ text: 'LOMÉ 228' }, { fontId: 'font-bebas', colorHex: '#FFFFFF' });
    expect(layersOf(g().content, 'back')).toHaveLength(1);
    expect(layersOf(g().content, 'front')).toHaveLength(1);
    expect(textLayerOf(g().content)?.text).toBe('LOMÉ 228');
    g().editText({ text: 'A'.repeat(30) }, { fontId: 'font-bebas', colorHex: '#FFFFFF' });
    expect([...(textLayerOf(g().content)?.text ?? '')]).toHaveLength(14);
    assertValid(s);
  });

  it('switches automatic text color with the t-shirt color', () => {
    const s = makeStore('col-noir');
    s.getState().editText(
      { text: 'TOGO' },
      { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'back' },
    );
    s.getState().chooseColor(white);
    expect(textLayerOf(s.getState().content)?.colorHex).toBe('#111111');
    s.getState().editText({ colorHex: '#D4AF37' }, { fontId: 'font-bebas', colorHex: '#FFFFFF' });
    s.getState().chooseColor(sand);
    expect(textLayerOf(s.getState().content)?.colorHex).toBe('#D4AF37');
    s.getState().chooseColor(black);
    expect(s.getState().content.colorId).toBe('col-noir');
  });
});

describe('store: history', () => {
  it('undoes and redoes, up to 30 levels', () => {
    const s = makeStore();
    const g = s.getState;
    g().choosePattern({ id: 'pat-soleil' });
    for (let i = 0; i < 40; i += 1) g().nudge(i % 2 === 0 ? 5 : -5, 0);
    expect(g().past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < 30; i += 1) g().undo();
    expect(g().past).toHaveLength(0);
    expect(g().future).toHaveLength(30);
    g().undo();
    for (let i = 0; i < 30; i += 1) g().redo();
    expect(g().future).toHaveLength(0);
    assertValid(s);
  });

  it('clears redo after a new edit and records one entry per gesture', () => {
    const s = makeStore();
    const g = s.getState;
    g().choosePattern({ id: 'pat-soleil' });
    const id = g().selectedId as string;
    g().beginGesture();
    const before = geoOfLayer(layersOf(g().content, 'front')[0] as Layer);
    g().commitGesture(id, { ...before, cx: before.cx + 20 });
    expect(g().past).toHaveLength(2);
    g().undo();
    expect(g().future).toHaveLength(1);
    g().chooseColor(white);
    expect(g().future).toHaveLength(0);
  });

  it('coalesces consecutive text typing into one undo step', () => {
    const s = makeStore();
    const g = s.getState;
    const d = { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'back' as const };
    g().editText({ text: 'T' }, d);
    g().editText({ text: 'TO' }, d);
    g().editText({ text: 'TOG' }, d);
    expect(g().past).toHaveLength(1);
    g().undo();
    expect(textLayerOf(g().content)).toBeNull();
  });
});

describe('gesture math', () => {
  const zone = { w: 297, h: 420 };
  it('never leaves the zone, whatever the gesture', () => {
    const base = { cx: 100, cy: 100, w: 150, h: 100, rot: 0 };
    const lim = { minScale: 0.2, maxScale: Infinity };
    for (const dx of [-900, 0, 900]) {
      for (const scale of [0.01, 1, 9]) {
        for (const dRot of [0, 33, 90, 135]) {
          const r = applyTransform(base, { dx, dy: dx, scale, dRot }, lim, zone);
          const rad = (r.rot * Math.PI) / 180;
          const bw = r.w * Math.abs(Math.cos(rad)) + r.h * Math.abs(Math.sin(rad));
          const bh = r.w * Math.abs(Math.sin(rad)) + r.h * Math.abs(Math.cos(rad));
          expect(r.cx - bw / 2).toBeGreaterThan(-1e-6);
          expect(r.cy - bh / 2).toBeGreaterThan(-1e-6);
          expect(r.cx + bw / 2).toBeLessThan(zone.w + 1e-6);
          expect(r.cy + bh / 2).toBeLessThan(zone.h + 1e-6);
        }
      }
    }
  });

  it('hit-tests rotated boxes', () => {
    const geo = { cx: 100, cy: 100, w: 100, h: 20, rot: 90 };
    expect(hitTest(geo, 100, 140)).toBe(true);
    expect(hitTest(geo, 140, 100)).toBe(false);
  });
});

describe('price and moderation', () => {
  it('computes the documented price and matches the mock API for the fixture designs', async () => {
    const expected = [11000, 11000, 12500];
    const api = createMockApi({ latencyMs: 0 });
    for (const [i, d] of FIXTURE_DESIGNS.entries()) {
      const local = computeUnitPriceXof(d.spec, FIXTURE_PRICE_RULES, FIXTURE_PATTERNS_BY_ID);
      const created = await api.createDesign({ spec: d.spec });
      expect(local).toBe(expected[i]);
      expect(created.unitPriceXof).toBe(local);
    }
  });

  it('flags banned words as typed and the API refuses them', async () => {
    expect(containsBannedWord('Quelle MERDE', MOCK_BANNED_WORDS)).toBe(true);
    expect(containsBannedWord('LOMÉ 228', MOCK_BANNED_WORDS)).toBe(false);
    const s = makeStore();
    s.getState().editText(
      { text: 'MERDE' },
      { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'back' },
    );
    const spec = selectSpec(s.getState());
    await expect(
      createMockApi({ latencyMs: 0 }).createDesign({ spec: spec as DesignSpec }),
    ).rejects.toMatchObject({
      code: 'TEXT_REJECTED',
    });
  });
});

describe('drafts: offline then sync', () => {
  const flaky = (inner: ApiClient, state: { online: boolean }): ApiClient =>
    new Proxy(inner, {
      get:
        (target, prop: keyof ApiClient) =>
        (...args: unknown[]) => {
          if (!state.online) return Promise.reject(new ApiError('NETWORK', 'Pas de connexion.'));
          return (target[prop] as (...a: unknown[]) => unknown)(...args);
        },
    });

  it('persists, survives a restart, and syncs when back online', async () => {
    const storage = createMemoryStorage();
    const repo = createDraftsRepo(storage);
    const s = makeStore();
    s.getState().choosePattern({ id: 'pat-kente-ewe' });
    const spec = selectSpec(s.getState()) as DesignSpec;
    repo.save({ localId: s.getState().localId, spec });
    repo.setPreview(s.getState().localId, 'front', 'iVBORw0KGgo=');

    const reopened = createDraftsRepo(storage);
    expect(reopened.currentId()).toBe(s.getState().localId);
    expect(reopened.get(s.getState().localId)?.spec).toEqual(spec);

    const net = { online: false };
    const mock = createMockApi({ latencyMs: 0 });
    const api = flaky(mock, net);
    expect(await syncDrafts(api, reopened)).toMatchObject({ offline: true, synced: 0 });
    expect(reopened.pending()).toHaveLength(1);

    net.online = true;
    expect(await syncDrafts(api, reopened)).toMatchObject({ offline: false, synced: 1, failed: 0 });
    const rec = reopened.get(s.getState().localId) as DraftRecord;
    expect(rec.dirty).toBe(false);
    expect(rec.serverId).toBeTruthy();
    expect(rec.previewFrontDirty).toBe(false);
    expect(reopened.pending()).toHaveLength(0);
    const server = await mock.listDesigns({ drafts: true });
    expect(server.items.some((d) => d.id === rec.serverId && d.previewFrontUrl)).toBe(true);
  });

  it('marks a rejected text and does not retry it until edited', async () => {
    const repo = createDraftsRepo(createMemoryStorage());
    const s = makeStore();
    s.getState().editText(
      { text: 'PUTAIN' },
      { fontId: 'font-bebas', colorHex: '#FFFFFF', side: 'back' },
    );
    repo.save({ localId: 'l1', spec: selectSpec(s.getState()) as DesignSpec });
    const api = createMockApi({ latencyMs: 0 });
    expect(await syncDrafts(api, repo)).toMatchObject({ failed: 1 });
    expect(repo.get('l1')?.syncError).toBe('TEXT_REJECTED');
    expect(repo.pending()).toHaveLength(0);
  });
});

describe('catalog cache', () => {
  it('falls back to the cached catalog when offline', async () => {
    const storage = createMemoryStorage();
    const api = createMockApi({ latencyMs: 0 });
    const first = await loadCatalog(api, storage);
    expect(first.fromCache).toBe(false);
    expect(first.catalog.bannedWords.length).toBeGreaterThan(0);
    const dead = new Proxy(api, {
      get: () => () => Promise.reject(new ApiError('NETWORK', 'Pas de connexion.')),
    });
    const second = await loadCatalog(dead, storage);
    expect(second.fromCache).toBe(true);
    await expect(loadCatalog(dead, createMemoryStorage())).rejects.toBeInstanceOf(ApiError);
  });
});
