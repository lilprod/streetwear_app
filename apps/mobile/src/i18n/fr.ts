export const fr = {
  'home.title': 'Accueil',
  'home.createDesign': 'Créer un design',
  'home.myDesigns': 'Mes designs',

  'common.back': 'Retour',

  'state.loading': 'Chargement…',
  'state.retry': 'Réessayer',
  'state.empty.title': 'Rien à afficher',
  'state.error.title': 'Une erreur est survenue',
  'state.offline.title': 'Tu es hors ligne',

  'api.network': 'Pas de connexion.',
  'api.timeout': 'Le serveur met trop de temps à répondre.',
  'api.unavailable': 'Le service est indisponible.',
  'api.invalidResponse': 'Réponse inattendue du serveur.',
  'api.invalidDesign': 'Le design est invalide.',
  'api.designNotFound': 'Design introuvable.',
  'api.patternInactive': "Ce motif n'est plus disponible.",
  'api.colorInactive': "Cette couleur n'est plus disponible.",
  'api.textRejected': 'Ce texte ne peut pas être imprimé.',
  'api.previewInvalid': 'Aperçu invalide.',

  'studio.title': 'Studio',
  'studio.undo': 'Annuler',
  'studio.redo': 'Rétablir',
  'studio.myDesigns': 'Mes designs',
  'studio.side.label': 'Face du t-shirt',
  'studio.side.front': 'Devant',
  'studio.side.back': 'Dos',
  'studio.canvas.label': 'Aperçu du t-shirt',
  'studio.canvas.empty': 'Aperçu du t-shirt, aucun motif pour le moment',
  'studio.tab.patterns': 'Motifs',
  'studio.tab.color': 'Couleur',
  'studio.tab.text': 'Texte',
  'studio.banner.offline': 'Hors ligne. Ton brouillon est gardé sur le téléphone.',
  'studio.banner.stale': 'Catalogue hors ligne. Certains motifs peuvent avoir changé.',
  'studio.catalog.offline': 'Connecte-toi à Internet pour charger les motifs.',
  'studio.catalog.error': 'Impossible de charger les motifs.',
  'studio.price.label': 'Prix du t-shirt',
  'studio.price.unavailable': 'Prix indisponible',
  'studio.sync.pending': 'Enregistrement…',
  'studio.sync.synced': 'Enregistré',
  'studio.sync.offline': 'Enregistré sur le téléphone',
  'studio.sync.error': 'Enregistrement impossible, nouvel essai plus tard',

  'studio.patterns.all': 'Tous',
  'studio.patterns.empty': 'Aucun motif dans cette catégorie.',
  'studio.patterns.pick': 'Choisir le motif {name}',
  'studio.patterns.repeat': 'Répéter',
  'studio.patterns.tile.smaller': 'Motif répété plus petit',
  'studio.patterns.tile.bigger': 'Motif répété plus grand',

  'studio.color.pick': 'Couleur {name}',

  'studio.text.input': 'Texte à imprimer',
  'studio.text.placeholder': 'Ton texte',
  'studio.text.counter': '{n}/{max}',
  'studio.text.banned': 'Ce texte ne peut pas être imprimé.',
  'studio.text.color.auto': 'Couleur automatique',
  'studio.text.color.gold': 'Or',
  'studio.text.color.red': 'Rouge',
  'studio.text.size.smaller': 'Texte plus petit',
  'studio.text.size.bigger': 'Texte plus grand',
  'studio.text.size.value': '{mm} mm',

  'studio.adjust.show': 'Ajuster avec les boutons',
  'studio.adjust.hide': 'Masquer les boutons',
  'studio.adjust.smaller': 'Réduire',
  'studio.adjust.bigger': 'Agrandir',
  'studio.adjust.rotateLeft': 'Pivoter de {deg} degrés vers la gauche',
  'studio.adjust.rotateRight': 'Pivoter de {deg} degrés vers la droite',
  'studio.adjust.delete': "Supprimer l'élément",
  'studio.adjust.left': 'Déplacer vers la gauche',
  'studio.adjust.right': 'Déplacer vers la droite',
  'studio.adjust.up': 'Déplacer vers le haut',
  'studio.adjust.down': 'Déplacer vers le bas',

  'designs.title': 'Mes designs',
  'designs.unnamed': 'Design sans nom',
  'designs.open': 'Ouvrir {name}',
  'designs.delete': 'Supprimer ce design',
  'designs.pending': 'À synchroniser',
  'designs.banner.offline': 'Hors ligne. Seuls les designs du téléphone sont à jour.',
  'designs.error.load': 'Impossible de charger tes designs.',
  'designs.error.action': 'Action impossible pour le moment. Réessaie.',
  'designs.empty.title': 'Aucun design',
  'designs.empty.message': 'Compose ton premier t-shirt.',
  'designs.empty.cta': 'Créer un design',
} as const;

export type FrKey = keyof typeof fr;

export function t(key: FrKey, params?: Record<string, string | number>): string {
  const template: string = fr[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
