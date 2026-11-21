import { Redis } from 'ioredis';

let seq = 0;

/** Les compteurs de débit vivent 60 s dans Redis et sont partagés entre suites (même IP locale) : repartir de zéro. */
export async function clearThrottleKeys(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? '');
  try {
    const keys = await redis.keys('throttle:*');
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

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
