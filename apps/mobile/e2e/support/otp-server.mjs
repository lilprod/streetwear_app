// Sidecar for the Maestro flows: serves the latest SMS code sent to a phone number.
// Reads the JSON-lines outbox written by the API when TEST_SMS_OUTBOX_FILE is set (never in production).
//   node otp-server.mjs <outbox-file> [port=3999]
//   GET /otp?phone=%2B22890000001  ->  { "code": "123456" }   (waits up to 20 s, else 404)
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const [file, portArg] = process.argv.slice(2);
if (!file) {
  console.error('Usage : node otp-server.mjs <fichier-outbox-sms> [port]');
  process.exit(2);
}
const port = Number(portArg ?? 3999);
const MAX_AGE_MS = 5 * 60_000;

async function latestCode(phone) {
  let raw = '';
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  const lines = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  for (const l of lines.reverse()) {
    if (l.phone !== phone || Date.now() - Date.parse(l.at) > MAX_AGE_MS) continue;
    const m = /code est (\d{6})/.exec(l.text);
    if (m) return m[1];
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const phone = url.searchParams.get('phone');
  if (url.pathname !== '/otp' || !phone) {
    res.writeHead(400).end();
    return;
  }
  const end = Date.now() + 20_000;
  for (;;) {
    const code = await latestCode(phone);
    if (code) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ code }));
      return;
    }
    if (Date.now() > end) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  res.writeHead(404).end();
}).listen(port, '127.0.0.1', () => console.log(`otp-server sur 127.0.0.1:${port}`));
