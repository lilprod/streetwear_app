let seq = 0;

export async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
  }
}

export const nextPhone = (): string => `+22891${String(100_000 + ++seq + (Date.now() % 800_000))}`;

/** IP aléatoire par appel : les compteurs Redis (60 s) ne se recoupent pas entre tests ou exécutions. */
export const uniqueIp = (): string =>
  `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${(++seq % 250) + 1}`;
