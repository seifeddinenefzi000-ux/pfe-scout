```ts
import { task } from '@trigger.dev/sdk';

import { pluginRegistry } from '../plugins/PluginRegistry.js';
import { registerPlugins } from '../plugins/registerPlugins.js';
import { SourceRepository } from '../repositories/SourceRepository.js';
import { processPipelineTask } from './processPipelineTask.js';
import { logger } from '../utils/logger.js';

export const crawlSourcesTask = task({
  id: 'crawl-sources',

  run: async () => {
    registerPlugins();

    logger.info('Starting PFE Scout international source crawling');

    const sourceRepo = new SourceRepository();
    const activeSources = await sourceRepo.getActiveSources();

    let totalItemsCrawled = 0;
    let sourcesProcessed = 0;
    let sourcesFailed = 0;
    let pipelinesStarted = 0;

    for (const source of activeSources) {
      const plugin =
        pluginRegistry.get(source.pluginId) ||
        pluginRegistry.getForUrl(source.url);

      if (!plugin) {
        sourcesFailed++;

        await sourceRepo.updateCrawlStatus(
          source.id,
          'NO_PLUGIN'
        );

        continue;
      }

      try {
        const page = await plugin.collect(source.url);
        const rawItems = await plugin.normalize(page);

        totalItemsCrawled += rawItems.length;
        sourcesProcessed++;

        logger.info(
          'Source produced internship items: ' +
            String(rawItems.length)
        );

        if (rawItems.length > 0) {
          await processPipelineTask.triggerAndWait({
            payload: {
              rawItems: rawItems,
              sourceId: source.id,
            },
          });

          pipelinesStarted++;

          logger.info(
            'Processing pipeline completed successfully'
          );
        }

        await sourceRepo.updateCrawlStatus(
          source.id,
          'HEALTHY'
        );
      } catch (error) {
        sourcesFailed++;

        logger.error(
          'Error while crawling source',
          {
            error: String(error),
          }
        );

        await sourceRepo.updateCrawlStatus(
          source.id,
          'ERROR'
        );
      }
    }

    logger.info(
      'PFE Scout source crawling completed'
    );

    return {
      activeSources: activeSources.length,
      sourcesProcessed: sourcesProcessed,
      sourcesFailed: sourcesFailed,
      totalItemsCrawled: totalItemsCrawled,
      pipelinesStarted: pipelinesStarted,
    };
  },
});

