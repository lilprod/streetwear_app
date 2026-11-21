import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from '../../config/env';
import { ConsoleSmsProvider } from './sms.provider';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
};

describe('ConsoleSmsProvider test outbox', () => {
  it('appends each SMS to the outbox file when configured', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'sms-')), 'out.jsonl');
    const sms = new ConsoleSmsProvider(parseEnv({ ...base, TEST_SMS_OUTBOX_FILE: file }));
    await sms.send('+22890000001', 'Code 123456');
    await sms.send('+22890000002', 'Code 654321');
    const lines = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { phone: string; text: string });
    expect(lines.map((l) => [l.phone, l.text])).toEqual([
      ['+22890000001', 'Code 123456'],
      ['+22890000002', 'Code 654321'],
    ]);
  });

  it('writes no file without the variable', async () => {
    const sms = new ConsoleSmsProvider(parseEnv(base));
    await sms.send('+22890000001', 'Code 123456');
    expect(sms.outbox).toHaveLength(1);
  });
});
