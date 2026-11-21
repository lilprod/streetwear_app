// Liste les routes RÉELLES de l'API compilée (méthode, chemin, rôles) à partir des métadonnées NestJS.
// Usage : node qa/security/extract-routes.mjs > qa/results/routes-code.json   (API compilée requise : pnpm --filter api build)
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(here, '../../apps/api');
const req = createRequire(path.join(apiDir, 'package.json'));
process.chdir(apiDir);
process.loadEnvFile(path.join(apiDir, '.env'));
process.env.LOG_LEVEL = 'silent';
req('reflect-metadata');
const { NestFactory } = req('@nestjs/core');
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

async function main() {
  const { AppModule } = req(path.join(apiDir, 'dist/app.module.js'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const container = app.container ?? app['container'];
  const routes = [];
  for (const mod of container.getModules().values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype;
      if (!cls) continue;
      const prefix = Reflect.getMetadata('path', cls) ?? '';
      const classRoles = Reflect.getMetadata('roles', cls);
      const classPublic = Reflect.getMetadata('public', cls);
      const proto = cls.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = proto[name];
        const method = Reflect.getMetadata('method', handler);
        if (method === undefined) continue;
        const sub = Reflect.getMetadata('path', handler) ?? '/';
        const paths = Array.isArray(prefix) ? prefix : [prefix];
        const subs = Array.isArray(sub) ? sub : [sub];
        for (const p of paths) {
          for (const s of subs) {
            const full = ('/' + [p, s].join('/')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
            routes.push({
              method: METHODS[method],
              path: full,
              roles: Reflect.getMetadata('roles', handler) ?? classRoles ?? null,
              public: Reflect.getMetadata('public', handler) ?? classPublic ?? false,
              controller: cls.name,
              handler: name,
            });
          }
        }
      }
    }
  }
  await app.close();
  routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  process.stdout.write(JSON.stringify(routes, null, 2));
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
