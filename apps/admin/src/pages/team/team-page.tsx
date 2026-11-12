import { useState } from 'react';
import { SectionTabs, type SectionTab } from '../../components/section-tabs';
import { fr } from '../../i18n/fr';
import { AccountsPanel } from './accounts-panel';
import { AuditPanel } from './audit-panel';

type TeamTab = 'accounts' | 'audit';
const TABS: readonly SectionTab<TeamTab>[] = [
  { id: 'accounts', label: fr['team.tab.accounts'] },
  { id: 'audit', label: fr['team.tab.audit'] },
];

export function TeamPage() {
  const [tab, setTab] = useState<TeamTab>('accounts');
  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['team.title']}</h1>
      <SectionTabs label={fr['team.tabs']} tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'accounts' ? <AccountsPanel /> : <AuditPanel />}
    </section>
  );
}
