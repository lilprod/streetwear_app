import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { FIXTURE_ORDERS } from '@streetwear/shared';
import { fr } from '../../i18n/fr';
import { parseGeoJson } from '../../lib/geojson';
import { patchDemoOrder } from '../../mocks/orders-handlers';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';

const leaflet = vi.hoisted(() => ({
  polygon: vi.fn(),
  tile: vi.fn(),
  map: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('leaflet', () => {
  const map = {
    fitBounds: vi.fn(),
    remove: () => leaflet.remove(),
    addLayer: vi.fn(),
  };
  const layer = { addTo: () => layer, getBounds: () => ({}) };
  return {
    default: {
      map: (...a: unknown[]) => (leaflet.map(...a), map),
      tileLayer: (...a: unknown[]) => (leaflet.tile(...a), layer),
      polygon: (...a: unknown[]) => (leaflet.polygon(...a), layer),
    },
  };
});

const T = 15_000;
const lbl = (k: 'zones.col.name' | 'zones.col.fee' | 'zones.col.delay') =>
  new RegExp(`^${fr[k].replace(/[()]/g, '\\$&')}`);
const square = (lng: number, lat: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng, lat],
      [lng + 0.02, lat],
      [lng + 0.02, lat + 0.02],
      [lng, lat],
    ],
  ],
});
const goodGeo = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [1.2, 6.1],
      [1.25, 6.1],
      [1.25, 6.15],
      [1.2, 6.1],
    ],
  ],
});

describe('rôles', () => {
  it('affiche 403 pour le livreur et la production sur /livraisons', async () => {
    loginAs('production');
    const { unmount } = renderApp('/livraisons');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
    unmount();
    localStorage.clear();
    loginAs('courier');
    renderApp('/livraisons/zones');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('la logistique voit Livraisons et Retrait, pas le stock', async () => {
    loginAs('logistics');
    renderApp('/livraisons');
    const nav = await screen.findByRole('navigation', { name: fr['nav.label'] });
    expect(within(nav).getByRole('link', { name: fr['nav.deliveries'] })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: fr['nav.pickup'] })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: fr['nav.stock'] })).not.toBeInTheDocument();
  });
});

describe('courses du jour', () => {
  it(
    'liste les courses avec numéro, frais COD en FCFA et statuts',
    async () => {
      loginAs('logistics');
      renderApp('/livraisons');
      const table = await screen.findByRole('table', { name: fr['deliveries.caption'] });
      expect(await within(table).findByText('TG-000003')).toBeInTheDocument();
      expect(within(table).getByText('TG-000004')).toBeInTheDocument();
      expect(
        within(table).getByText((c) => c.replace(/\s/g, '') === '15000FCFA'),
      ).toBeInTheDocument();
      expect(within(table).getByText(fr['delivery.status.to_assign'])).toBeInTheDocument();
      expect(within(table).getAllByText('Koffi Livreur').length).toBeGreaterThan(0);
    },
    T,
  );

  it(
    'filtre par statut',
    async () => {
      loginAs('logistics');
      renderApp('/livraisons');
      const user = userEvent.setup();
      await screen.findByText('TG-000003');
      await user.selectOptions(
        screen.getByLabelText(fr['deliveries.filter.status']),
        fr['delivery.status.delivered'],
      );
      await waitFor(() => expect(screen.queryByText('TG-000003')).not.toBeInTheDocument());
      expect(await screen.findByText('TG-000008')).toBeInTheDocument();
    },
    T,
  );

  it('affecte un livreur puis débloque « Expédier » sur la commande', async () => {
    patchDemoOrder(FIXTURE_ORDERS[2]?.id ?? '', { status: 'ready' });
    loginAs('logistics');
    renderApp('/livraisons');
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText(fr['deliveries.courier']),
      await screen.findByRole('option', { name: 'Ama Livreuse' }),
    );
    await user.click(
      await screen.findByRole('button', { name: `${fr['deliveries.assign']} TG-000003` }),
    );
    expect(await screen.findByText(fr['deliveries.assigned'])).toBeInTheDocument();
    const table = screen.getByRole('table', { name: fr['deliveries.caption'] });
    await waitFor(() =>
      expect(
        within(table).getByRole('button', { name: `${fr['deliveries.reassign']} TG-000003` }),
      ).toBeInTheDocument(),
    );
    await user.click(within(table).getByRole('link', { name: 'TG-000003' }));
    const ship = await screen.findByRole('button', { name: fr['order.action.shipped'] });
    expect(ship).toBeEnabled();
    expect(await screen.findByText('Ama Livreuse')).toBeInTheDocument();
  }, 30_000);

  it(
    'garde « Expédier » bloqué sans livreur',
    async () => {
      patchDemoOrder(FIXTURE_ORDERS[2]?.id ?? '', { status: 'ready' });
      loginAs('logistics');
      renderApp(`/commandes/${FIXTURE_ORDERS[2]?.id}`);
      const ship = await screen.findByRole('button', { name: fr['order.action.shipped'] });
      expect(ship).toBeDisabled();
      expect(screen.getByText(fr['order.precondition.requiresCourier'])).toBeInTheDocument();
    },
    T,
  );

  it(
    'affiche le numéro TG-… dans le fil d’Ariane du détail',
    async () => {
      loginAs('order_manager');
      renderApp(`/commandes/${FIXTURE_ORDERS[2]?.id}`);
      const crumbs = await screen.findByRole('navigation', { name: fr['breadcrumb.label'] });
      await waitFor(() => expect(within(crumbs).getByText('TG-000003')).toBeInTheDocument());
      expect(crumbs).not.toHaveTextContent(FIXTURE_ORDERS[2]?.id ?? 'x');
    },
    T,
  );

  it(
    'affiche les erreurs typées en français',
    async () => {
      loginAs('logistics');
      server.use(
        http.post('*/v1/admin/deliveries/:id/assign', () =>
          HttpResponse.json(
            {
              error: {
                code: 'INVALID_TRANSITION',
                message: 'Cette livraison ne peut plus être réaffectée.',
              },
            },
            { status: 409 },
          ),
        ),
      );
      renderApp('/livraisons');
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: `${fr['deliveries.assign']} TG-000003` }),
      );
      expect(
        await screen.findByText('Cette livraison ne peut plus être réaffectée.'),
      ).toBeInTheDocument();
    },
    T,
  );

  it(
    'affiche un message d’erreur clair, sans saisie d’identifiant, si la liste des livreurs est absente',
    async () => {
      loginAs('logistics');
      server.use(
        http.get('*/v1/admin/couriers', () =>
          HttpResponse.json(
            { error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } },
            { status: 404 },
          ),
        ),
      );
      renderApp('/livraisons');
      expect(await screen.findByText('Ressource introuvable.')).toBeInTheDocument();
      expect(screen.queryByLabelText('Identifiant du livreur')).not.toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: `${fr['deliveries.assign']} TG-000003` }),
      ).toBeDisabled();
    },
    T,
  );

  it(
    'n’appelle pas le détail de commande pour chaque ligne',
    async () => {
      loginAs('logistics');
      let detailCalls = 0;
      server.events.on('request:start', ({ request }) => {
        if (/\/v1\/admin\/orders\/[0-9a-f-]{36}$/.test(request.url)) detailCalls += 1;
      });
      renderApp('/livraisons');
      expect(await screen.findByText('TG-000003')).toBeInTheDocument();
      server.events.removeAllListeners();
      expect(detailCalls).toBe(0);
    },
    T,
  );

  it(
    'saisit les dates au format JJ/MM/AAAA',
    async () => {
      loginAs('logistics');
      renderApp('/livraisons');
      const user = userEvent.setup();
      const date = await screen.findByLabelText(fr['deliveries.date']);
      await user.clear(date);
      await user.type(date, '01/01/2020');
      expect(await screen.findByText(fr['deliveries.empty'])).toBeInTheDocument();
      await user.clear(date);
      await user.type(date, '31/02/2026');
      expect(await screen.findByText(fr['date.invalid'])).toBeInTheDocument();
    },
    T,
  );
});

describe('zones de livraison', () => {
  it(
    'liste les zones avec frais en FCFA et délais',
    async () => {
      loginAs('logistics');
      renderApp('/livraisons/zones');
      const table = await screen.findByRole('table', { name: fr['zones.caption'] });
      expect(await within(table).findByText('Lomé centre')).toBeInTheDocument();
      expect(
        within(table).getByText((c) => c.replace(/\s/g, '') === '1000FCFA'),
      ).toBeInTheDocument();
      expect(within(table).getByText('24 h')).toBeInTheDocument();
    },
    T,
  );

  it(
    'valide le GeoJSON, refuse hors Togo et montre l’aperçu avant enregistrement',
    async () => {
      loginAs('logistics');
      renderApp('/livraisons/zones');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: fr['zones.add'] }));
      const form = await screen.findByRole('form', { name: fr['zones.form.create'] });
      const area = within(form).getByLabelText(fr['zones.geo.paste']);
      fireEvent.change(area, { target: { value: JSON.stringify(square(10, 50)) } });
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        fr['zones.geo.error.out_of_togo'],
      );
      fireEvent.change(area, { target: { value: '{ pas du json' } });
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        fr['zones.geo.error.invalid_json'],
      );
      leaflet.polygon.mockClear();
      fireEvent.change(area, { target: { value: goodGeo } });
      expect(await within(form).findByText(fr['zones.geo.valid'])).toBeInTheDocument();
      await waitFor(() => expect(leaflet.polygon).toHaveBeenCalled());
      expect(leaflet.tile.mock.calls[0]?.[0]).toContain('tile.openstreetmap.org');
    },
    T,
  );

  it('crée une zone après aperçu', async () => {
    loginAs('logistics');
    renderApp('/livraisons/zones');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: fr['zones.add'] }));
    const form = await screen.findByRole('form', { name: fr['zones.form.create'] });
    await user.click(within(form).getByRole('button', { name: fr['zones.save'] }));
    expect(await within(form).findByText(fr['zones.error.name'])).toBeInTheDocument();
    await user.type(within(form).getByLabelText(lbl('zones.col.name')), 'Kégué');
    await user.type(within(form).getByLabelText(lbl('zones.col.fee')), '2000');
    await user.type(within(form).getByLabelText(lbl('zones.col.delay')), '36');
    fireEvent.change(within(form).getByLabelText(fr['zones.geo.paste']), {
      target: { value: goodGeo },
    });
    await user.click(within(form).getByRole('button', { name: fr['zones.save'] }));
    expect(await screen.findByText(fr['zones.created'])).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: fr['zones.caption'] });
    expect(await within(table).findByText('Kégué')).toBeInTheDocument();
  }, 30_000);

  it(
    'modifie les frais sans renvoyer le polygone',
    async () => {
      loginAs('super_admin');
      let body: Record<string, unknown> = {};
      server.use(
        http.patch('*/v1/admin/delivery-zones/:id', async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: 'x' });
        }),
      );
      renderApp('/livraisons/zones');
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: `${fr['zones.edit']} Lomé centre` }),
      );
      const form = await screen.findByRole('form', { name: fr['zones.form.edit'] });
      const fee = within(form).getByLabelText(lbl('zones.col.fee'));
      await user.clear(fee);
      await user.type(fee, '1200');
      await user.click(within(form).getByRole('button', { name: fr['zones.save'] }));
      await waitFor(() => expect(body.feeXof).toBe(1200));
      expect(body).not.toHaveProperty('polygon');
    },
    T,
  );

  it(
    'affiche l’erreur de l’API (400) dans le formulaire',
    async () => {
      loginAs('logistics');
      server.use(
        http.post('*/v1/admin/delivery-zones', () =>
          HttpResponse.json(
            {
              error: { code: 'VALIDATION_FAILED', message: 'Les données envoyées sont invalides.' },
            },
            { status: 400 },
          ),
        ),
      );
      renderApp('/livraisons/zones');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: fr['zones.add'] }));
      const form = await screen.findByRole('form', { name: fr['zones.form.create'] });
      await user.type(within(form).getByLabelText(lbl('zones.col.name')), 'Z');
      await user.type(within(form).getByLabelText(lbl('zones.col.fee')), '0');
      await user.type(within(form).getByLabelText(lbl('zones.col.delay')), '0');
      fireEvent.change(within(form).getByLabelText(fr['zones.geo.paste']), {
        target: { value: goodGeo },
      });
      await user.click(within(form).getByRole('button', { name: fr['zones.save'] }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Les données envoyées sont invalides.',
      );
    },
    T,
  );
});

describe('parseGeoJson', () => {
  const ring = [
    [1.2, 6.1],
    [1.3, 6.1],
    [1.3, 6.2],
    [1.2, 6.1],
  ];
  it('accepte Polygon, MultiPolygon, Feature et FeatureCollection', () => {
    expect(parseGeoJson(JSON.stringify({ type: 'Polygon', coordinates: [ring] })).ok).toBe(true);
    expect(
      parseGeoJson(JSON.stringify({ type: 'MultiPolygon', coordinates: [[ring], [ring]] })).ok,
    ).toBe(true);
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
    expect(parseGeoJson(JSON.stringify(feature)).ok).toBe(true);
    expect(
      parseGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [feature] })).ok,
    ).toBe(true);
  });
  it('refuse les types, anneaux et positions invalides', () => {
    const err = (o: unknown) => {
      const r = parseGeoJson(JSON.stringify(o));
      return r.ok ? null : r.error;
    };
    expect(err({ type: 'Point', coordinates: [1.2, 6.1] })).toBe('bad_type');
    expect(err({ type: 'Polygon', coordinates: [ring.slice(0, 3)] })).toBe('bad_ring');
    expect(err({ type: 'Polygon', coordinates: [[...ring.slice(0, 3), [9, 9]]] })).toBe('bad_ring');
    expect(err({ type: 'Polygon', coordinates: [[['a', 1], ...ring.slice(1)]] })).toBe(
      'bad_position',
    );
    expect(
      err({
        type: 'Polygon',
        coordinates: [
          [
            [6.1, 1.2],
            [6.2, 1.2],
            [6.2, 1.3],
            [6.1, 1.2],
          ],
        ],
      }),
    ).toBe('out_of_togo');
    expect(err({ type: 'FeatureCollection', features: [] })).toBe('no_geometry');
  });
});
