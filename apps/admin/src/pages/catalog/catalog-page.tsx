import { useState } from 'react';
import { SectionTabs, type SectionTab } from '../../components/section-tabs';
import { fr } from '../../i18n/fr';
import { ColorsPanel, CategoriesPanel } from './taxonomy-panels';
import { BannedWordsPanel, FontsPanel, PriceRulesPanel } from './misc-panels';
import { PatternsPanel } from './patterns-panel';

type CatalogTab = 'patterns' | 'categories' | 'colors' | 'fonts' | 'prices' | 'banned';

const TABS: readonly SectionTab<CatalogTab>[] = [
  { id: 'patterns', label: fr['catalog.tab.patterns'] },
  { id: 'categories', label: fr['catalog.tab.categories'] },
  { id: 'colors', label: fr['catalog.tab.colors'] },
  { id: 'fonts', label: fr['catalog.tab.fonts'] },
  { id: 'prices', label: fr['catalog.tab.prices'] },
  { id: 'banned', label: fr['catalog.tab.banned'] },
];

export function CatalogPage() {
  const [tab, setTab] = useState<CatalogTab>('patterns');
  return (
    <section>
      <h1 className="text-[32px] font-semibold leading-10">{fr['catalog.title']}</h1>
      <SectionTabs label={fr['catalog.tabs']} tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'patterns' && <PatternsPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'colors' && <ColorsPanel />}
      {tab === 'fonts' && <FontsPanel />}
      {tab === 'prices' && <PriceRulesPanel />}
      {tab === 'banned' && <BannedWordsPanel />}
    </section>
  );
}
