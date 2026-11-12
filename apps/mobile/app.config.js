// Complète app.json avec les valeurs qui dépendent de l'environnement de build (aucun secret dans le dépôt).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const projectId = process.env.EAS_PROJECT_ID;
  return {
    ...config,
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
