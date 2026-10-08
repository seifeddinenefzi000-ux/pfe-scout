import { task } from '@trigger.dev/sdk';

import { SourceRepository } from '../repositories/SourceRepository.js';
import { logger } from '../utils/logger.js';

export const discoveryTask = task({
  id: 'source-discovery',

  run: async (payload: { sourceId?: string }) => {
    logger.info(
      'Starting Trigger.dev Source Discovery task',
      payload
    );

    const sourceRepo =
      new SourceRepository();

    const activeSources =
      await sourceRepo.getActiveSources();

    logger.info(
      `Discovered ${activeSources.length} active sources for crawling.`
    );

    return {
      discoveredSourcesCount:
        activeSources.length,
    };
  },
});
