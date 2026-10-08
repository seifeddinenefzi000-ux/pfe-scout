import { task } from '@trigger.dev/sdk';

import { InternshipRepository } from '../repositories/InternshipRepository.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';
import { logger } from '../utils/logger.js';

export const dailyDigestTask = task({
  id: 'daily-digest',

  run: async () => {
    logger.info('Running Daily Digest task');

    const internshipRepo =
      new InternshipRepository();

    const topItems =
      await internshipRepo.getTopRankedInternships(5);

    for (const item of topItems) {
      await telegramNotifier.sendInternshipAlert(item);
    }

    return {
      digestCount: topItems.length,
    };
  },
});

export const deadlineAlertsTask = task({
  id: 'deadline-alerts',

  run: async () => {
    logger.info('Running Deadline Alerts task');

    return {
      alertCount: 0,
    };
  },
});

export const cleanupTask = task({
  id: 'system-cleanup',

  run: async () => {
    logger.info('Running System Cleanup task');

    return {
      status: 'CLEANED',
    };
  },
});
