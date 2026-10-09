import { schedules, task } from '@trigger.dev/sdk';
import { crawlSourcesTask } from './crawlSourcesTask.js';
import { supervisorScoutService } from '../services/SupervisorScoutService.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';
import { logger } from '../utils/logger.js';

/**
 * Full End-to-End Autonomous Pipeline Runner
 * Runs live source crawling + International/French supervisor scouting + Telegram notifications
 */
export async function executeAutonomousPipeline(): Promise<{
  crawledResult: any;
  supervisorsContacted: number;
  status: string;
}> {
  logger.info('🚀 Starting 100% Autonomous PFE Scout Daily Job...');

  // 1. Run live crawling across all registered French energy and international sources
  let crawledResult: any = null;
  try {
    crawledResult = await crawlSourcesTask.triggerAndWait();
    logger.info('✓ Crawl sources completed successfully', { crawledResult });
  } catch (err) {
    logger.error('Error during crawl-sources execution', { error: String(err) });
  }

  // 2. Scout & tailor cold outreach for verified supervisors (1 US, 1 CA, 1 UK, 1 AU, 1 CH + France)
  let supervisorCount = 0;
  try {
    const supervisorDrafts = await supervisorScoutService.getDailySupervisorBatch(10);
    supervisorCount = supervisorDrafts.length;

    for (const draft of supervisorDrafts) {
      await telegramNotifier.sendApplicationApprovalCard(draft);
      // Small pause to maintain clean Telegram rate limits
      await new Promise((res) => setTimeout(res, 500));
    }

    logger.info(`✓ Sent ${supervisorCount} international supervisor cards to Telegram.`);
  } catch (err) {
    logger.error('Error scouting supervisors', { error: String(err) });
  }

  return {
    crawledResult,
    supervisorsContacted: supervisorCount,
    status: 'SUCCESS',
  };
}

/**
 * Scheduled Cron Task (Runs daily at 08:00 UTC)
 */
export const dailyPfeScoutSchedule = schedules.task({
  id: 'daily-pfe-scout-schedule',
  cron: '0 8 * * *',
  run: async () => {
    return await executeAutonomousPipeline();
  },
});

/**
 * On-Demand Triggerable Full Pipeline Task
 */
export const runFullScoutPipelineTask = task({
  id: 'run-full-scout-pipeline',
  run: async () => {
    return await executeAutonomousPipeline();
  },
});
