import { task } from '@trigger.dev/sdk';

import { crawlSourcesTask } from './crawlSourcesTask.js';

export const testCrawlTask = task({
  id: 'test-crawl-duplicate',

  run: async () => {
    const result =
      await crawlSourcesTask.trigger({});

    return {
      message:
        'crawl-sources triggered successfully',

      result,
    };
  },
});
