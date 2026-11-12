import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { formatTgPhone, type Address } from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError } from '../../api/types';
import { useSession } from '../../auth/session';
import { t } from '../../i18n/fr';
import { SCREEN_MARGIN, colors, fonts } from '../../theme';
import { Banner, Label, PrimaryButton, SecondaryButton, StateView } from '../../ui/controls';
import { ScreenHeader, SkeletonScreen } from '../../ui/design-system';
import { Screen } from '../../ui/Screen';
import { AddressEditor } from '../reception/AddressEditor';
import {
  draftFromAddress,
  emptyAddressDraft,
  validateAddress,
  type AddressDraft,
  type AddressErrors,
} from '../reception/logic';

type List =
  | { status: 'loading' }
  | { status: 'error'; offline: boolean }
  | { status: 'ready'; items: Address[] };

type Editing = { id: string | null; label: string; draft: AddressDraft } | null;

export function AddressesScreen() {
  const user = useSession((s) => s.user);
  const [list, setList] = useState<List>({ status: 'loading' });
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setList({ status: 'loading' });
    try {
      setList({ status: 'ready', items: await getApi().listAddresses() });
    } catch (e) {
      setList({ status: 'error', offline: e instanceof ApiError && e.isNetwork });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const edit = useCallback((next: AddressDraft) => {
    setEditing((e) => (e ? { ...e, draft: next } : e));
    setErrors({});
  }, []);

  const save = async () => {
    if (!editing) return;
    const check = validateAddress(editing.draft, editing.label);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      if (editing.id) await getApi().updateAddress(editing.id, check.input);
      else await getApi().createAddress(check.input);
      setEditing(null);
      await load();
    } catch {
      setFailure(t('addresses.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await getApi().deleteAddress(id);
      setConfirmId(null);
      await load();
    } catch {
      setFailure(t('addresses.actionError'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => (editing ? setEditing(null) : router.back());

  let content;
  if (editing) {
    content = (
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {failure ? <Banner tone="danger" text={failure} /> : null}
        <AddressEditor draft={editing.draft} onChange={edit} errors={errors} />
        <PrimaryButton label={t('addresses.save')} loading={busy} onPress={() => void save()} />
        <SecondaryButton label={t('addresses.cancel')} onPress={() => setEditing(null)} />
      </ScrollView>
    );
  } else if (list.status === 'loading') content = <SkeletonScreen />;
  else if (list.status === 'error') {
    content = (
      <StateView
        kind={list.offline ? 'offline' : 'error'}
        message={t('addresses.error')}
        onRetry={() => void load()}
      />
    );
  } else {
    content = (
      <ScrollView contentContainerStyle={styles.body}>
        {failure ? <Banner tone="danger" text={failure} /> : null}
        {list.items.length === 0 ? (
          <StateView
            kind="empty"
            title={t('addresses.empty.title')}
            message={t('addresses.empty.message')}
          />
        ) : null}
        {list.items.map((a) => (
          <View key={a.id} style={styles.card}>
            <Label style={styles.title}>{a.label}</Label>
            <Label>{t('addresses.row', { district: a.district, landmark: a.landmark })}</Label>
            <Label mono>{formatTgPhone(a.recipientPhone)}</Label>
            {a.zone ? null : <Label style={styles.danger}>{t('addresses.outOfZone')}</Label>}
            {confirmId === a.id ? (
              <View style={styles.actions}>
                <Label accessibilityRole="alert">{t('addresses.removeConfirm')}</Label>
                <PrimaryButton
                  label={t('addresses.removeYes')}
                  loading={busy}
                  onPress={() => void remove(a.id)}
                />
                <SecondaryButton label={t('addresses.cancel')} onPress={() => setConfirmId(null)} />
              </View>
            ) : (
              <View style={styles.actions}>
                <SecondaryButton
                  label={t('addresses.edit', { label: a.label })}
                  onPress={() =>
                    setEditing({ id: a.id, label: a.label, draft: draftFromAddress(a) })
                  }
                />
                <SecondaryButton
                  label={t('addresses.remove', { label: a.label })}
                  onPress={() => setConfirmId(a.id)}
                />
              </View>
            )}
          </View>
        ))}
        <PrimaryButton
          label={t('addresses.add')}
          onPress={() =>
            setEditing({
              id: null,
              label: t('reception.address.defaultLabel'),
              draft: emptyAddressDraft(user?.phone ?? ''),
            })
          }
        />
      </ScrollView>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={editing ? t('addresses.new') : t('addresses.title')} onBack={back} />
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: SCREEN_MARGIN, gap: 16 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontFamily: fonts.semibold },
  danger: { color: colors.danger, fontSize: 13 },
  actions: { gap: 8, marginTop: 8 },
});
