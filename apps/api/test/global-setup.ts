import { execSync } from 'node:child_process';
import './setup-env';

export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/..`,
    env: process.env,
    stdio: 'ignore',
  });
}
