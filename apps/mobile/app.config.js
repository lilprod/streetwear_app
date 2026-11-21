// Complète app.json avec les valeurs qui dépendent de l'environnement de build (aucun secret dans le dépôt).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const projectId = process.env.EAS_PROJECT_ID;
  // Build de recette automatisée (Maestro) uniquement : autorise le HTTP en clair vers l'API de test.
  // Jamais activé par les profils preview ou production d'eas.json.
  const allowCleartext = process.env.E2E_ALLOW_CLEARTEXT === '1';
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(allowCleartext
        ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]]
        : []),
    ],
    android: {
      ...config.android,
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
