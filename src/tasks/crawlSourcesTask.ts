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

    const sourceRepo = new SourceRepository();

    const activeSources =
      await sourceRepo.getActiveSources();

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

        logger.warn(
          'No plugin found for source: ' + source.url
        );

        continue;
      }

      try {
        logger.info(
          'Crawling source: ' + source.url
        );

        const page =
          await plugin.collect(source.url);

        const rawItems =
          await plugin.normalize(page);

        totalItemsCrawled += rawItems.length;
        sourcesProcessed++;

        logger.info(
          'Items found: ' + rawItems.length
        );

        if (rawItems.length > 0) {
          logger.info(
            'Starting process-pipeline with ' +
              rawItems.length +
              ' items.'
          );

          await processPipelineTask.triggerAndWait({
            rawItems: rawItems,
            sourceId: source.id,
          });

          pipelinesStarted++;

          logger.info(
            'Process-pipeline completed successfully.'
          );
        }

        await sourceRepo.updateCrawlStatus(
          source.id,
          'HEALTHY'
        );
      } catch (error) {
        sourcesFailed++;

        logger.error(
          'Crawl failed',
          {
            error: String(error),
            source: source.url,
          }
        );

        await sourceRepo.updateCrawlStatus(
          source.id,
          'ERROR'
        );
      }
    }

    return {
      activeSources: activeSources.length,
      sourcesProcessed: sourcesProcessed,
      sourcesFailed: sourcesFailed,
      totalItemsCrawled: totalItemsCrawled,
      pipelinesStarted: pipelinesStarted,
    };
  },
});
