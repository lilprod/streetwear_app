import { fireEvent, render, screen } from '@testing-library/react-native';
import { SIZES, formatXof, type OrderStatus } from '@streetwear/shared';
import { Segmented, Tabs, PrimaryButton, SecondaryButton } from './controls';
import {
  PatternTile,
  PriceRow,
  SizePicker,
  StatusBadge,
  Stepper,
  Timeline,
  timelineSteps,
} from './design-system';
import { TAB_ITEMS, TabBar } from './TabBar';

describe('PrimaryButton / SecondaryButton', () => {
  it('are real buttons with a label and a disabled state', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <PrimaryButton label="Payer" onPress={onPress} />
        <SecondaryButton label="Annuler" onPress={onPress} disabled />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Payer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    const disabled = screen.getByRole('button', { name: 'Annuler' });
    expect(disabled.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<PrimaryButton label="Payer" loading onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Payer' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Segmented and Tabs', () => {
  it('expose the selected option and report changes', async () => {
    const onChange = jest.fn();
    await render(
      <Segmented
        label="Face"
        value="front"
        onChange={onChange}
        options={[
          { value: 'front', label: 'Devant' },
          { value: 'back', label: 'Dos' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Devant' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Dos' }));
    expect(onChange).toHaveBeenCalledWith('back');
  });

  it('render tabs', async () => {
    const onChange = jest.fn();
    await render(
      <Tabs
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Motifs' },
          { value: 'b', label: 'Couleur' },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Couleur' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('SizePicker', () => {
  const sizes = SIZES.map((size) => ({ size, available: size !== 'XS' && size !== '3XL' }));

  it('strikes through sold-out sizes, labels them and blocks selection', async () => {
    const onChange = jest.fn();
    await render(<SizePicker sizes={sizes} value="M" onChange={onChange} />);
    expect(screen.getAllByText('Épuisé')).toHaveLength(2);
    const soldOut = screen.getByRole('button', { name: 'Taille XS, épuisée' });
    expect(soldOut.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(soldOut);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Taille M' }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Taille L' }));
    expect(onChange).toHaveBeenCalledWith('L');
  });
});

describe('Stepper', () => {
  const setup = (value: number, onChange = jest.fn()) =>
    render(
      <Stepper
        value={value}
        min={1}
        max={50}
        onChange={onChange}
        decrementLabel="Diminuer la quantité"
        incrementLabel="Augmenter la quantité"
        valueLabel={`Quantité : ${value}`}
      />,
    );

  it('cannot go below 1', async () => {
    const onChange = jest.fn();
    await setup(1, onChange);
    const less = screen.getByRole('button', { name: 'Diminuer la quantité' });
    expect(less.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(less);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot go above 50', async () => {
    const onChange = jest.fn();
    await setup(50, onChange);
    const more = screen.getByRole('button', { name: 'Augmenter la quantité' });
    expect(more.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(more);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps by one inside the range', async () => {
    const onChange = jest.fn();
    await setup(10, onChange);
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    expect(onChange.mock.calls).toEqual([[11], [9]]);
    expect(screen.getByLabelText('Quantité : 10')).toBeTruthy();
  });
});

describe('PriceRow', () => {
  it('shows amounts as 12 000 FCFA and reads label and amount together', async () => {
    await render(<PriceRow label="Total TTC" xof={12000} />);
    expect(screen.getByText(formatXof(12000))).toBeTruthy();
    expect(formatXof(12000)).toBe('12 000 FCFA');
    expect(screen.getByLabelText(`Total TTC : ${formatXof(12000)}`)).toBeTruthy();
  });

  it('shows a note instead of an amount', async () => {
    await render(<PriceRow label="Livraison" note="Calculée à l'étape suivante" />);
    expect(screen.getByText("Calculée à l'étape suivante")).toBeTruthy();
  });
});

describe('StatusBadge and Timeline', () => {
  it('shows the French label of the status', async () => {
    await render(<StatusBadge status="in_production" />);
    expect(screen.getByText('En production')).toBeTruthy();
    expect(screen.getByLabelText('Statut : En production')).toBeTruthy();
  });

  it.each<[OrderStatus, string[]]>([
    ['paid', ['current', 'todo', 'todo', 'todo', 'todo']],
    ['in_production', ['done', 'current', 'todo', 'todo', 'todo']],
    ['shipped', ['done', 'done', 'done', 'current', 'todo']],
    ['delivered', ['done', 'done', 'done', 'done', 'done']],
    ['pending_payment', ['todo', 'todo', 'todo', 'todo', 'todo']],
  ])('maps %s to timeline states', (status, expected) => {
    expect(timelineSteps(status).map((s) => s.state)).toEqual(expected);
  });

  it('announces each step with its state', async () => {
    await render(<Timeline steps={timelineSteps('ready')} />);
    expect(screen.getByLabelText('Prête, étape en cours')).toBeTruthy();
    expect(screen.getByLabelText('Payée, étape terminée')).toBeTruthy();
    expect(screen.getByLabelText('Livrée, étape à venir')).toBeTruthy();
  });
});

describe('TabBar', () => {
  it('lists the four tabs and reports the selected one', async () => {
    const onSelect = jest.fn();
    await render(<TabBar activeName="index" onSelect={onSelect} />);
    expect(TAB_ITEMS.map((i) => i.label)).toEqual(['Accueil', 'Studio', 'Commandes', 'Compte']);
    expect(screen.getByRole('tab', { name: 'Accueil' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByRole('tab', { name: 'Commandes' }));
    expect(onSelect).toHaveBeenCalledWith('orders');
  });
});

describe('PatternTile', () => {
  it('is a button named after the pattern', async () => {
    const onPress = jest.fn();
    await render(
      <PatternTile
        name="Kente"
        imageUrl="https://cdn.example.test/kente.webp"
        label="Motif Kente, origine Ghana. Ouvrir le studio"
        onPress={onPress}
      />,
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Motif Kente, origine Ghana. Ouvrir le studio' }),
    );
    expect(onPress).toHaveBeenCalled();
  });
});
