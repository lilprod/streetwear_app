import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  TEXT_MAX_LENGTH,
  TEXT_MAX_SIZE_MM,
  TEXT_MIN_SIZE_MM,
  type Font,
  type Pattern,
  type PatternCategory,
  type TshirtColor,
} from '@streetwear/shared';
import { t } from '../../i18n/fr';
import { MIN_TARGET, colors, fonts as themeFonts, radius } from '../../theme';
import { Chip, IconButton, Label, SecondaryButton, Swatch } from '../../ui/controls';
import {
  MOVE_STEP_MM,
  ROTATE_STEP_DEG,
  SCALE_STEP,
  patternLayerOf,
  textColorOptions,
  textLayerOf,
  type Content,
  type Side,
} from './model';
import type { StudioActions } from './store';

const FONT_LABEL_FAMILY: Record<string, string> = {
  'Bebas Neue': 'BebasNeue_400Regular',
  Anton: 'Anton_400Regular',
  'Permanent Marker': 'PermanentMarker_400Regular',
};

export function PatternsPanel({
  categories,
  patterns,
  content,
  side,
  actions,
}: {
  categories: PatternCategory[];
  patterns: Pattern[];
  content: Content;
  side: Side;
  actions: Pick<StudioActions, 'choosePattern' | 'setPatternOptions'>;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const shown = useMemo(
    () => (category ? patterns.filter((p) => p.categoryId === category) : patterns),
    [category, patterns],
  );
  const current = patternLayerOf(content, side);
  return (
    <View style={styles.panel}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
        <Chip
          label={t('studio.patterns.all')}
          selected={category === null}
          onPress={() => setCategory(null)}
        />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={category === c.id}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </ScrollView>
      <FlatList
        horizontal
        data={shown}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={<Label style={styles.muted}>{t('studio.patterns.empty')}</Label>}
        renderItem={({ item }) => {
          const selected = current?.patternId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('studio.patterns.pick', { name: item.name })}
              accessibilityState={{ selected }}
              onPress={() => actions.choosePattern(item)}
              style={styles.tile}
            >
              <Image
                source={{ uri: item.thumbnailUrl }}
                accessibilityIgnoresInvertColors
                style={[styles.thumb, selected && styles.thumbOn]}
              />
              <Label numberOfLines={1} style={styles.tileName}>
                {item.name}
              </Label>
            </Pressable>
          );
        }}
      />
      {current ? (
        <View style={styles.row}>
          <Chip
            label={t('studio.patterns.repeat')}
            selected={current.repeat === 'tile'}
            onPress={() =>
              actions.setPatternOptions({ repeat: current.repeat === 'tile' ? 'none' : 'tile' })
            }
          />
          {current.repeat === 'tile' ? (
            <>
              <IconButton
                glyph="−"
                label={t('studio.patterns.tile.smaller')}
                onPress={() => actions.setPatternOptions({ tileScale: current.tileScale / 1.25 })}
              />
              <IconButton
                glyph="+"
                label={t('studio.patterns.tile.bigger')}
                onPress={() => actions.setPatternOptions({ tileScale: current.tileScale * 1.25 })}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ColorPanel({
  colors: list,
  colorId,
  onPick,
}: {
  colors: TshirtColor[];
  colorId: string;
  onPick: (c: TshirtColor) => void;
}) {
  const current = list.find((c) => c.id === colorId);
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        {list.map((c) => (
          <Swatch
            key={c.id}
            hex={c.hex}
            label={t('studio.color.pick', { name: c.name })}
            selected={c.id === colorId}
            onPress={() => onPick(c)}
          />
        ))}
      </View>
      {current ? <Label style={styles.muted}>{current.name}</Label> : null}
    </View>
  );
}

export function TextPanel({
  content,
  side,
  fonts,
  color,
  banned,
  actions,
}: {
  content: Content;
  side: Side;
  fonts: Font[];
  color: TshirtColor | undefined;
  banned: boolean;
  actions: Pick<StudioActions, 'editText' | 'removeSelected'>;
}) {
  const layer = textLayerOf(content);
  const options = color ? textColorOptions(color) : ['#FFFFFF', '#D4AF37', '#C8102E'];
  const defaults = {
    fontId: layer?.fontId ?? fonts[0]?.id ?? '',
    colorHex: layer?.colorHex ?? options[0] ?? '#FFFFFF',
    side: layer ? undefined : ('back' as Side),
  };
  const colorLabels = [
    t('studio.text.color.auto'),
    t('studio.text.color.gold'),
    t('studio.text.color.red'),
  ];
  const length = [...(layer?.text ?? '')].length;
  void side;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={t('studio.text.input')}
          placeholder={t('studio.text.placeholder')}
          placeholderTextColor={colors.inkDisabled}
          maxLength={TEXT_MAX_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          value={layer?.text ?? ''}
          onChangeText={(text) => actions.editText({ text }, defaults)}
          style={[styles.input, banned && styles.inputBad]}
        />
        <Label mono style={styles.counter}>
          {t('studio.text.counter', { n: length, max: TEXT_MAX_LENGTH })}
        </Label>
      </View>
      {banned ? (
        <Label accessibilityLiveRegion="polite" style={styles.error}>
          {t('studio.text.banned')}
        </Label>
      ) : null}
      {layer ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
            {fonts.map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                fontFamily={FONT_LABEL_FAMILY[f.family]}
                selected={layer.fontId === f.id}
                onPress={() => actions.editText({ fontId: f.id }, defaults)}
              />
            ))}
          </ScrollView>
          <View style={styles.row}>
            {options.map((hex, i) => (
              <Swatch
                key={hex}
                hex={hex}
                label={colorLabels[i] ?? hex}
                selected={layer.colorHex.toUpperCase() === hex.toUpperCase()}
                onPress={() => actions.editText({ colorHex: hex }, defaults)}
              />
            ))}
            <IconButton
              glyph="−"
              label={t('studio.text.size.smaller')}
              disabled={layer.sizeMm <= TEXT_MIN_SIZE_MM}
              onPress={() => actions.editText({ sizeMm: layer.sizeMm - 2 }, defaults)}
            />
            <Label mono>{t('studio.text.size.value', { mm: Math.round(layer.sizeMm) })}</Label>
            <IconButton
              glyph="+"
              label={t('studio.text.size.bigger')}
              disabled={layer.sizeMm >= TEXT_MAX_SIZE_MM}
              onPress={() => actions.editText({ sizeMm: layer.sizeMm + 2 }, defaults)}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

export function AdjustPanel({
  actions,
}: {
  actions: Pick<StudioActions, 'nudge' | 'scaleBy' | 'rotateBy' | 'removeSelected'>;
}) {
  const m = MOVE_STEP_MM;
  return (
    <View style={styles.adjust}>
      <View style={styles.row}>
        <IconButton
          glyph="−"
          label={t('studio.adjust.smaller')}
          onPress={() => actions.scaleBy(1 / SCALE_STEP)}
        />
        <IconButton
          glyph="+"
          label={t('studio.adjust.bigger')}
          onPress={() => actions.scaleBy(SCALE_STEP)}
        />
        <IconButton
          glyph="↺"
          label={t('studio.adjust.rotateLeft', { deg: ROTATE_STEP_DEG })}
          onPress={() => actions.rotateBy(-ROTATE_STEP_DEG)}
        />
        <IconButton
          glyph="↻"
          label={t('studio.adjust.rotateRight', { deg: ROTATE_STEP_DEG })}
          onPress={() => actions.rotateBy(ROTATE_STEP_DEG)}
        />
        <IconButton glyph="⌫" label={t('studio.adjust.delete')} onPress={actions.removeSelected} />
      </View>
      <View style={styles.row}>
        <IconButton
          glyph="←"
          label={t('studio.adjust.left')}
          onPress={() => actions.nudge(-m, 0)}
        />
        <IconButton glyph="↑" label={t('studio.adjust.up')} onPress={() => actions.nudge(0, -m)} />
        <IconButton glyph="↓" label={t('studio.adjust.down')} onPress={() => actions.nudge(0, m)} />
        <IconButton
          glyph="→"
          label={t('studio.adjust.right')}
          onPress={() => actions.nudge(m, 0)}
        />
      </View>
    </View>
  );
}

export function AdjustToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <SecondaryButton
      label={open ? t('studio.adjust.hide') : t('studio.adjust.show')}
      onPress={onToggle}
    />
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  adjust: { paddingHorizontal: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', flexGrow: 0, gap: 4 },
  muted: { color: colors.inkSecondary, fontSize: 13 },
  tile: { width: 84, marginRight: 12 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.field,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbOn: { borderColor: colors.ink },
  tileName: { fontSize: 13, marginTop: 4 },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.field,
    paddingHorizontal: 12,
    fontFamily: themeFonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  inputBad: { borderColor: colors.danger },
  counter: { fontSize: 13, color: colors.inkSecondary, minWidth: 48, textAlign: 'right' },
  error: { color: colors.danger, fontSize: 13 },
});
