import { getSupabaseClient } from '../database/client.js';
import { SourceEntity } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';
import { FRENCH_ENERGY_SOURCES } from '../config/FrenchEnergySourceCatalog.js';

export class SourceRepository {
  private client = getSupabaseClient();

  async getActiveSources(): Promise<SourceEntity[]> {
    let dbSources: SourceEntity[] = [];

    try {
      const { data, error } = await this.client
        .from('sources')
        .select('*')
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        dbSources = data.map((row: Record<string, any>) => ({
          id: row.id,
          name: row.name,
          type: row.type,
          url: row.url,
          pluginId: row.plugin_id || 'generic-html',
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
      }
    } catch (err) {
      logger.warn('Could not read sources from Supabase, loading from French catalog.', { error: String(err) });
    }

    // Always ensure the full catalog of French Renewable, Storage, STEP, Microgrids & PV sources is loaded
    const existingUrls = new Set(dbSources.map((s) => s.url.toLowerCase()));
    const catalogSources: SourceEntity[] = FRENCH_ENERGY_SOURCES
      .filter((s) => !existingUrls.has(s.url.toLowerCase()))
      .map((def, idx) => ({
        id: `source_french_${idx}_${def.category.toLowerCase()}`,
        name: def.name,
        type: (def.type === 'LABORATORY' || def.type === 'UNIVERSITY_PORTAL' ? 'UNIVERSITY' : 'CORPORATE') as SourceEntity['type'],
        url: def.url,
        pluginId: def.pluginId,
        isActive: true,
        requestsPerMinute: 30,
        maxConcurrency: 2,
        crawlDelayMs: 1500,
        lastHealthStatus: 'HEALTHY',
        metadataJson: { category: def.category, location: def.location },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

    const combined = [...dbSources, ...catalogSources];
    logger.info(`SourceRepository: Loaded ${combined.length} active French energy sources (Renewables, Storage, STEP, Microgrids, PV).`);
    return combined;
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
    } catch {
      // Non-blocking for catalog-based IDs
    }
  }
}
