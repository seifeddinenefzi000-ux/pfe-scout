import 'dotenv/config';
import { executeAutonomousPipeline } from '../tasks/dailyPfeScoutJobTask.js';
import { telegramApprovalListener } from '../services/TelegramApprovalListener.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('🚀 Starting Autonomous PFE Scout CLI Runner...');

  // Start real-time telegram approval listener
  telegramApprovalListener.startPolling();

  try {
    const result = await executeAutonomousPipeline();
    logger.info('✅ Autonomous Scout Run Completed Successfully:', result);
    logger.info('🤖 Real-time Telegram listener is active. You can approve or reject cards in Telegram!');
  } catch (error) {
    logger.error('❌ Scout Run encountered an error:', { error: String(error) });
  }
}

main();
