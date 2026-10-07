import { task } from '@trigger.dev/sdk/v3';

import { pluginRegistry } from '../plugins/PluginRegistry.js';
import { SourceRepository } from '../repositories/SourceRepository.js';
import { processPipelineTask } from './processPipelineTask.js';
import { logger } from '../utils/logger.js';

export const crawlSourcesTask = task({
  id: 'crawl-sources',

  run: async () => {
    logger.info(
      'Starting PFE Scout international source crawling'
    );

    const sourceRepo =
      new SourceRepository();

    const activeSources =
      await sourceRepo.getActiveSources();

    let totalItemsCrawled = 0;
    let sourcesProcessed = 0;
    let sourcesFailed = 0;
    let pipelinesStarted = 0;


    // ------------------------------------------------------------
    // Crawl every active source
    // ------------------------------------------------------------

    for (const source of activeSources) {

      const plugin =
        pluginRegistry.get(source.pluginId) ||
        pluginRegistry.getForUrl(source.url);


      if (!plugin) {

        logger.warn(
          `No plugin found for source: ${source.name}`,
          {
            pluginId: source.pluginId,
            url: source.url,
          }
        );

        await sourceRepo.updateCrawlStatus(
          source.id,
          'NO_PLUGIN'
        );

        sourcesFailed++;

        continue;
      }


      try {

        logger.info(
          `Crawling source: ${source.name}`,
          {
            url: source.url,
            plugin: plugin.id,
          }
        );


        // --------------------------------------------------------
        // 1. COLLECT
        // --------------------------------------------------------

        const page =
          await plugin.collect(
            source.url
          );


        // --------------------------------------------------------
        // 2. NORMALIZE
        // --------------------------------------------------------

        const rawItems =
          await plugin.normalize(
            page
          );


        totalItemsCrawled +=
          rawItems.length;

        sourcesProcessed++;


        logger.info(
          `Source "${source.name}" produced ${rawItems.length} raw items.`
        );


        // --------------------------------------------------------
        // 3. SEND RESULTS INTO THE PIPELINE
        // --------------------------------------------------------

        if (rawItems.length > 0) {

          await processPipelineTask.trigger({
            rawItems,
            sourceId: source.id,
          });

          pipelinesStarted++;

          logger.info(
            `Processing pipeline triggered for "${source.name}".`
          );

        } else {

          logger.info(
            `No internship items found for "${source.name}".`
          );
        }


        // --------------------------------------------------------
        // 4. UPDATE SOURCE HEALTH
        // --------------------------------------------------------

        await sourceRepo.updateCrawlStatus(
          source.id,
          'HEALTHY'
        );

      } catch (error) {

        sourcesFailed++;

        logger.error(
          `Error crawling source "${source.name}"`,
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


    // ------------------------------------------------------------
    // RESULT
    // ------------------------------------------------------------

    logger.info(
      'PFE Scout source crawling completed',
      {
        activeSources: activeSources.length,
        sourcesProcessed,
        sourcesFailed,
        totalItemsCrawled,
        pipelinesStarted,
      }
    );


    return {
      activeSources:
        activeSources.length,

      sourcesProcessed,

      sourcesFailed,

      totalItemsCrawled,

      pipelinesStarted,
    };
  },
});
