import { fr, type FrKey } from '../i18n/fr';

export function ModulePage({ titleKey }: { titleKey: FrKey }) {
  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr[titleKey]}</h1>
      <p className="mt-2 text-sm text-inkSecondary">{fr['module.soon']}</p>
    </section>
  );
}
