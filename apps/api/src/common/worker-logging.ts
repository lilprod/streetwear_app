import { Logger } from '@nestjs/common';
import type { Worker } from 'bullmq';
import { captureServerError } from '../config/sentry';

export interface FailureLogger {
  error(message: string): void;
}

/** Journalise chaque job en échec (nom d'erreur seul : jamais de données du job) et le signale à Sentry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logFailedJobs<T extends Worker<any, any, string>>(
  worker: T,
  logger: FailureLogger = new Logger('Worker'),
): T {
  worker.on('failed', (job, err) => {
    logger.error(
      `File ${worker.name} : job ${job?.name ?? '?'} (${job?.id ?? '?'}) en échec, tentative ${job?.attemptsMade ?? '?'} : ${err.name}`,
    );
    captureServerError(err, { queue: worker.name });
  });
  worker.on('error', (err) => {
    logger.error(`File ${worker.name} : erreur du worker : ${err.name}`);
  });
  return worker;
}
