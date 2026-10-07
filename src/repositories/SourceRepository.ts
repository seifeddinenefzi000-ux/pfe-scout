import { getSupabaseClient } from '../database/client.js';
import { SourceEntity } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export class SourceRepository {
  private client = getSupabaseClient();

  async getActiveSources(): Promise<SourceEntity[]> {
    try {
      const { data, error } = await this.client
        .from('sources')
        .select('*')
        .eq('is_active', true);

      if (error) {
  throw new Error(`Failed to fetch active sources: ${error.message}`);
}

      return (data || []).map((row: Record<string, any>) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        url: row.url,
        pluginId: row.plugin_id,
        isActive: row.is_active,
        requestsPerMinute: row.requests_per_minute || 30,
        maxConcurrency: row.max_concurrency || 2,
        crawlDelayMs: row.crawl_delay_ms || 2000,
        userAgent: row.user_agent,
        lastCrawledAt: row.last_crawled_at,
        lastHealthStatus: row.last_health_status,
        metadataJson: row.metadata_json || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      logger.error('Error in SourceRepository.getActiveSources', { error: String(err) });
      return [];
    }
  }

  async updateCrawlStatus(sourceId: string, status: string): Promise<void> {
    try {
      await this.client
        .from('sources')
        .update({
          last_crawled_at: new Date().toISOString(),
          last_health_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sourceId);
    } catch (err) {
      logger.error('Failed to update source crawl status', { sourceId, error: String(err) });
    }
  }
}
