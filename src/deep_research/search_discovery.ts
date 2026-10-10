import { SafeHttpFetcherService } from './http_fetcher.js';
import { HtmlExtractorService } from './html_extractor.js';
import { SearchRunRecord } from './types.js';
import { SupabaseWriterService } from './supabase_writer.js';
import { AuditLoggerService } from './audit_logger.js';
import { GLOBAL_ENERGY_SOURCES } from '../config/FrenchEnergySourceCatalog.js';

export interface SearchOptions {
  maxResultsPerQuery?: number;
  country?: string;
  year?: number;
}

export interface DiscoveredSearchResult {
  url: string;
  query: string;
  sourceAdapter: string;
  titleSnippet?: string;
}

export interface SearchAdapter {
  name: string;
  executeSearch(query: string, options?: SearchOptions): Promise<{
    run: SearchRunRecord;
    results: DiscoveredSearchResult[];
  }>;
}

/**
 * Adapter 1: Official Laboratory & Energy Portal Discovery Adapter
 */
export class InstitutionalPortalAdapter implements SearchAdapter {
  public name = 'INSTITUTIONAL_PORTALS';

  public async executeSearch(query: string, options?: SearchOptions): Promise<{
    run: SearchRunRecord;
    results: DiscoveredSearchResult[];
  }> {
    const startTime = Date.now();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const results: DiscoveredSearchResult[] = [];
    const maxResults = options?.maxResultsPerQuery ?? 10;
    let httpStatus = 200;
    let errorDetails: string | undefined;

    try {
      // Query keywords
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

      // Iterate through verified institutional portals
      for (const source of GLOBAL_ENERGY_SOURCES) {
        if (results.length >= maxResults) break;

        const fetchRes = await SafeHttpFetcherService.fetch(source.url, { timeoutMs: 6000 });
        if (!fetchRes.ok || !fetchRes.data) continue;

        const html = typeof fetchRes.data === 'string'
          ? fetchRes.data
          : Buffer.from(fetchRes.data).toString('utf-8');

        const extracted = HtmlExtractorService.extract(html, source.url);

        // Check if page content or discovered links match query keywords
        const allCandidates = [
          ...extracted.discoveredPdfs,
          ...extracted.outgoingLinks,
        ];

        for (const candUrl of allCandidates) {
          if (results.length >= maxResults) break;

          const lowerUrl = candUrl.toLowerCase();
          const matchesTerm = queryTerms.some(term => lowerUrl.includes(term) || extracted.cleanText.toLowerCase().includes(term));

          if (matchesTerm) {
            results.push({
              url: candUrl,
              query,
              sourceAdapter: this.name,
              titleSnippet: `${source.name} - ${source.category}`,
            });
          }
        }
      }
    } catch (err) {
      httpStatus = 500;
      errorDetails = String(err);
    }

    const run: SearchRunRecord = {
      id: runId,
      query,
      sourceAdapter: this.name,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      status: errorDetails ? 'FAILED' : 'COMPLETED',
      resultsCount: results.length,
      httpStatus,
      paginationInfo: { limit: maxResults },
      errorDetails,
      retryCount: 0,
    };

    await SupabaseWriterService.saveSearchRun(run);

    return { run, results };
  }
}

/**
 * Adapter 2: Public Academic & Research Job Boards Adapter
 */
export class AcademicJobBoardAdapter implements SearchAdapter {
  public name = 'ACADEMIC_JOB_BOARDS';

  public async executeSearch(query: string, options?: SearchOptions): Promise<{
    run: SearchRunRecord;
    results: DiscoveredSearchResult[];
  }> {
    const startTime = Date.now();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const results: DiscoveredSearchResult[] = [];
    const maxResults = options?.maxResultsPerQuery ?? 10;
    let httpStatus = 200;
    let errorDetails: string | undefined;

    // Public academic search platforms with open web endpoints
    const platforms = [
      {
        name: 'CNRS Emploi Public Portal',
        endpoint: `https://emploi.cnrs.fr/Recherche/Offre?MotsCles=${encodeURIComponent(query)}`,
      },
      {
        name: 'ABG Association Bernard Gregory',
        endpoint: `https://www.abg.asso.fr/fr/candidat/offres?keywords=${encodeURIComponent(query)}`,
      },
      {
        name: 'AcademicPositions',
        endpoint: `https://academicpositions.com/jobs?keywords=${encodeURIComponent(query)}`,
      },
    ];

    for (const p of platforms) {
      if (results.length >= maxResults) break;

      try {
        const fetchRes = await SafeHttpFetcherService.fetch(p.endpoint, { timeoutMs: 7000 });
        if (!fetchRes.ok || !fetchRes.data) continue;

        const html = typeof fetchRes.data === 'string'
          ? fetchRes.data
          : Buffer.from(fetchRes.data).toString('utf-8');

        const extracted = HtmlExtractorService.extract(html, p.endpoint);

        for (const link of extracted.outgoingLinks) {
          if (results.length >= maxResults) break;
          const lower = link.toLowerCase();
          if (lower.includes('offre') || lower.includes('job') || lower.includes('stage') || lower.includes('position')) {
            results.push({
              url: link,
              query,
              sourceAdapter: this.name,
              titleSnippet: `${p.name} listing`,
            });
          }
        }
      } catch (err) {
        // Individual endpoint error should not abort adapter
      }
    }

    const run: SearchRunRecord = {
      id: runId,
      query,
      sourceAdapter: this.name,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      status: errorDetails ? 'FAILED' : 'COMPLETED',
      resultsCount: results.length,
      httpStatus,
      paginationInfo: { limit: maxResults },
      errorDetails,
      retryCount: 0,
    };

    await SupabaseWriterService.saveSearchRun(run);

    return { run, results };
  }
}

/**
 * Search Discovery Manager orchestrating all configurable query matrices and adapters
 */
export class SearchDiscoveryService {
  public static readonly DEFAULT_QUERIES = [
    'stage PFE énergie',
    'stage ingénieur énergétique',
    'stage recherche énergie',
    'stage M2 énergie',
    'stage batteries',
    'stage hydrogène',
    'stage stockage thermique',
    'energy engineering internship',
    'renewable energy research internship',
    'battery storage internship',
    'thermal energy storage internship',
    'hydrogen research internship',
    'energy systems modelling internship',
  ];

  private static adapters: SearchAdapter[] = [
    new InstitutionalPortalAdapter(),
    new AcademicJobBoardAdapter(),
  ];

  public static registerAdapter(adapter: SearchAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Run discovery across all configured queries and adapters
   */
  public static async discoverOffers(options?: {
    queries?: string[];
    maxResultsPerQuery?: number;
  }): Promise<DiscoveredSearchResult[]> {
    const startTime = Date.now();
    const queries = options?.queries ?? this.DEFAULT_QUERIES;
    const maxResults = options?.maxResultsPerQuery ?? 5;

    const allDiscovered: DiscoveredSearchResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      for (const adapter of this.adapters) {
        try {
          const { results } = await adapter.executeSearch(query, { maxResultsPerQuery: maxResults });
          for (const res of results) {
            if (!seenUrls.has(res.url)) {
              seenUrls.add(res.url);
              allDiscovered.push(res);
            }
          }
        } catch (err) {
          AuditLoggerService.log({
            taskName: 'search_discovery',
            operation: `search_${adapter.name}`,
            status: 'WARN',
            error: String(err),
            retryCount: 0,
            durationMs: 0,
          });
        }
      }
    }

    AuditLoggerService.log({
      taskName: 'search_discovery',
      operation: 'discoverOffers',
      status: 'SUCCESS',
      retryCount: 0,
      durationMs: Date.now() - startTime,
    });

    return allDiscovered;
  }
}
