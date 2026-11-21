import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  FIXTURE_COLORS,
  FIXTURE_FONTS,
  FIXTURE_PATTERNS,
  VALID_DESIGNS,
  type DesignSpec,
  type Layer,
} from '@streetwear/shared';
import { setApiForTests } from '../../api';
import { createMockApi } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { memoryStorage, network, resetMemoryStorage, resetRouter } from '../../../tests/mocks';
import { checkAvailability, parseInactiveItems } from './availability';
import { loadCatalog } from './catalog';
import { createDraftsRepo } from './drafts';
import { contentFromSpec } from './model';
import { StudioScreen } from './StudioScreen';

jest.mock('./StudioCanvas', () => ({ StudioCanvas: () => null }));
jest.mock('./useStudioFonts', () => ({ useStudioFonts: () => ({}) }));
jest.mock('./preview', () => ({ capturePreview: () => null }));
jest.mock('./shirt', () => ({ SHIRT_W_MM: 560, SHIRT_H_MM: 700 }));

// Full screens render through react-native's JS renderer: under a parallel Turborepo run the
// first render of the file exceeds Jest's 5 s default.
jest.setTimeout(30_000);

const spec = VALID_DESIGNS.patternOnly as DesignSpec;
const patternLayer = (spec.zones.front?.layers ?? []).find((l) => l.type === 'pattern') as Layer;
const REMOVED = 'pat-kente-ewe';
const noticeId = `layer-unavailable-${patternLayer.id}`;

const withoutPattern = (base: ApiClient, removed: string): ApiClient => ({
  ...base,
  listPatterns: async (q) => {
    const page = await base.listPatterns(q);
    return { ...page, items: page.items.filter((p) => p.id !== removed) };
  },
});

const base = (): ApiClient => createMockApi({ latencyMs: 0 });

beforeEach(() => {
  resetMemoryStorage();
  resetRouter();
  network.online = true;
  createDraftsRepo(memoryStorage()).save({ localId: 'draft-1', spec, name: 'Mon kente' });
});

afterAll(() => setApiForTests(null));

const open = (api: ApiClient) => {
  setApiForTests(api);
  return render(<StudioScreen draftId="draft-1" onContinue={jest.fn()} />);
};

describe('studio: unavailable pattern on a draft (AN-001, US-03)', () => {
  it('flags the layer, blocks the size step, then unblocks after a replacement', async () => {
    await open(withoutPattern(base(), REMOVED));
    const notice = await screen.findByTestId(noticeId);
    expect(notice).toHaveProp('accessibilityRole', 'alert');
    expect(notice).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByText('Motif indisponible')).toBeTruthy();
    expect(screen.getByTestId('studio-continue')).toBeDisabled();
    expect(screen.getByText('Prix indisponible')).toBeTruthy();

    fireEvent.press(screen.getByTestId(`${noticeId}-replace`));
    fireEvent.press(await screen.findByTestId('pattern-pat-losanges'));

    await waitFor(() => expect(screen.queryByTestId(noticeId)).toBeNull());
    expect(screen.getByTestId('studio-continue')).toBeEnabled();
    expect(screen.queryByText('Prix indisponible')).toBeNull();
  });

  it('lets the customer remove the layer instead', async () => {
    await open(withoutPattern(base(), REMOVED));
    await screen.findByTestId(noticeId);
    fireEvent.press(screen.getByTestId(`${noticeId}-remove`));
    await waitFor(() => expect(screen.queryByTestId(noticeId)).toBeNull());
    expect(screen.queryByText('Motif indisponible')).toBeNull();
  });

  it('attaches a PATTERN_INACTIVE error from design creation to the right layer', async () => {
    const api: ApiClient = {
      ...base(),
      createDesign: async () => {
        throw new ApiError('PATTERN_INACTIVE', 'Inactif', 422, {
          items: [{ kind: 'pattern', id: REMOVED }],
        });
      },
    };
    await open(api);
    expect(await screen.findByTestId(noticeId)).toBeTruthy();
    expect(screen.getByText('Motif indisponible')).toBeTruthy();
    expect(screen.getByTestId('studio-continue')).toBeDisabled();
    const rec = createDraftsRepo(memoryStorage()).get('draft-1');
    expect(rec?.inactiveItems).toEqual([{ kind: 'pattern', id: REMOVED }]);
  });

  it('does not declare the pattern unavailable when the catalog is an offline cache', async () => {
    const stale = withoutPattern(base(), REMOVED);
    await loadCatalog(stale, memoryStorage());
    network.online = false;
    const offline: ApiClient = {
      ...stale,
      listCategories: async () => {
        throw new ApiError('NETWORK', 'Hors ligne');
      },
    };
    await open(offline);
    expect(await screen.findByTestId('studio-unverified')).toBeTruthy();
    expect(screen.queryByTestId(noticeId)).toBeNull();
    expect(screen.queryByText('Motif indisponible')).toBeNull();
    expect(screen.getByTestId('studio-continue')).toBeEnabled();
  });
});

describe('availability rules', () => {
  const catalog = { patterns: FIXTURE_PATTERNS, fonts: FIXTURE_FONTS, colors: FIXTURE_COLORS };

  it('flags inactive fonts and colors only against a verified catalog', () => {
    const content = contentFromSpec({
      version: 1,
      colorId: 'col-gone',
      zones: {
        front: {
          layers: [
            {
              type: 'text',
              id: 'a0000000-0000-4000-8000-000000000001',
              text: 'LOMÉ',
              fontId: 'font-gone',
              colorHex: '#FFFFFF',
              sizeMm: 20,
              x: 140,
              y: 100,
              rotation: 0,
              align: 'center',
            },
          ],
        },
      },
    } as DesignSpec);
    const checked = checkAvailability(content, catalog, { verified: true });
    expect(checked.unavailable.map((u) => u.kind)).toEqual(['font', 'color']);
    const offline = checkAvailability(content, catalog, { verified: false });
    expect(offline.unavailable).toEqual([]);
    expect(offline.unverified).toHaveLength(2);
  });

  it('parses details.items defensively', () => {
    expect(
      parseInactiveItems({ items: [{ kind: 'font', id: 'f' }, { kind: 'x', id: 'y' }, 3] }),
    ).toEqual([{ kind: 'font', id: 'f' }]);
    expect(parseInactiveItems(undefined)).toEqual([]);
  });
});
