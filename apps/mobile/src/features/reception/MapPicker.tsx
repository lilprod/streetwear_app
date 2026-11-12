import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import { t } from '../../i18n/fr';
import { colors, radius } from '../../theme';
import { IconButton, Label } from '../../ui/controls';
import { NUDGE_DEGREES } from './logic';

type Props = { lat: number; lng: number; onChange: (lat: number, lng: number) => void };

const DELTA = 0.02;

/**
 * Carte avec point déplaçable (glisser le point, ou toucher la carte). Alternative sans geste :
 * quatre boutons qui déplacent le point d'environ 110 m.
 */
export default function MapPicker({ lat, lng, onChange }: Props) {
  const ref = useRef<MapView>(null);
  useEffect(() => {
    ref.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: DELTA, longitudeDelta: DELTA },
      200,
    );
  }, [lat, lng]);
  const move = (c: LatLng) => onChange(c.latitude, c.longitude);
  return (
    <View style={styles.wrap}>
      <View accessible accessibilityLabel={t('reception.map.label')} style={styles.mapBox}>
        <MapView
          ref={ref}
          style={styles.map}
          initialRegion={{
            latitude: lat,
            longitude: lng,
            latitudeDelta: DELTA,
            longitudeDelta: DELTA,
          }}
          onPress={(e) => move(e.nativeEvent.coordinate)}
          toolbarEnabled={false}
        >
          <Marker
            draggable
            coordinate={{ latitude: lat, longitude: lng }}
            title={t('reception.map.marker')}
            onDragEnd={(e) => move(e.nativeEvent.coordinate)}
          />
        </MapView>
      </View>
      <Label style={styles.hint}>{t('reception.map.hint')}</Label>
      <View style={styles.nudges}>
        <IconButton
          glyph="↑"
          label={t('reception.map.nudge.north')}
          onPress={() => onChange(lat + NUDGE_DEGREES, lng)}
        />
        <IconButton
          glyph="↓"
          label={t('reception.map.nudge.south')}
          onPress={() => onChange(lat - NUDGE_DEGREES, lng)}
        />
        <IconButton
          glyph="←"
          label={t('reception.map.nudge.west')}
          onPress={() => onChange(lat, lng - NUDGE_DEGREES)}
        />
        <IconButton
          glyph="→"
          label={t('reception.map.nudge.east')}
          onPress={() => onChange(lat, lng + NUDGE_DEGREES)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  mapBox: {
    height: 220,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  map: { flex: 1 },
  hint: { color: colors.inkSecondary, fontSize: 13, lineHeight: 18 },
  nudges: { flexDirection: 'row', gap: 8 },
});
