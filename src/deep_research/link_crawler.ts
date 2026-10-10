import { SafeHttpFetcherService } from './http_fetcher.js';
import { HtmlExtractorService } from './html_extractor.js';
import { PdfExtractorService, ExtractedPdfResult } from './pdf_extractor.js';
import { AuditLoggerService } from './audit_logger.js';

export interface DiscoveredResource {
  url: string;
  parentUrl?: string;
  depth: number;
  contentType: string;
  httpStatus: number;
  contentHash: string;
  title?: string;
  rawText: string;
  isPdf: boolean;
  discoveredLinks: string[];
  pdfResult?: ExtractedPdfResult;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPagesPerDomain?: number;
  maxTotalPages?: number;
  allowedKeywords?: string[];
}

export class LinkCrawlerService {
  private static readonly DEFAULT_KEYWORDS = [
    'stage', 'internship', 'pfe', 'm2', 'recherche', 'recrutement',
    'equipe', 'team', 'members', 'people', 'contact', 'lab', 'laboratoire',
    'profil', 'profile', 'chercheur', 'researcher', 'energy', 'energie',
  ];

  /**
   * Bounded crawl starting from an initial set of URLs
   */
  public static async crawl(
    seedUrls: string[],
    options?: CrawlOptions
  ): Promise<Map<string, DiscoveredResource>> {
    const maxDepth = options?.maxDepth ?? 2;
    const maxPagesPerDomain = options?.maxPagesPerDomain ?? 5;
    const maxTotalPages = options?.maxTotalPages ?? 25;
    const keywords = options?.allowedKeywords ?? this.DEFAULT_KEYWORDS;

    const visited = new Map<string, DiscoveredResource>();
    const domainCounts = new Map<string, number>();

    const queue: Array<{ url: string; depth: number; parentUrl?: string }> = seedUrls.map(
      url => ({ url, depth: 1 })
    );

    while (queue.length > 0 && visited.size < maxTotalPages) {
      const item = queue.shift();
      if (!item) break;

      const { url, depth, parentUrl } = item;

      // Skip already visited
      if (visited.has(url)) continue;

      // Check per-domain limits
      let domain = '';
      try {
        domain = new URL(url).hostname.toLowerCase();
      } catch {
        continue;
      }

      const currentDomainCount = domainCounts.get(domain) || 0;
      if (currentDomainCount >= maxPagesPerDomain) {
        continue;
      }

      // Fetch resource
      const startTime = Date.now();
      const fetchRes = await SafeHttpFetcherService.fetch(url, { maxRedirects: 4 });
      if (!fetchRes.ok || !fetchRes.data) {
        AuditLoggerService.log({
          taskName: 'link_crawler',
          url,
          operation: 'fetch',
          status: 'WARN',
          error: fetchRes.error || `HTTP ${fetchRes.status}`,
          retryCount: 0,
          durationMs: Date.now() - startTime,
        });
        continue;
      }

      domainCounts.set(domain, currentDomainCount + 1);

      const isPdf =
        fetchRes.contentType.toLowerCase().includes('application/pdf') ||
        url.toLowerCase().endsWith('.pdf');

      let rawText = '';
      let title: string | undefined;
      let discoveredLinks: string[] = [];
      let pdfResult: ExtractedPdfResult | undefined;

      if (isPdf) {
        try {
          const pdfBuffer = Buffer.isBuffer(fetchRes.data)
            ? fetchRes.data
            : Buffer.from(fetchRes.data);
          pdfResult = await PdfExtractorService.extractPdf(pdfBuffer, { sourceUrl: url });
          rawText = pdfResult.fullText;
          title = pdfResult.metadata.title;
          discoveredLinks = pdfResult.allLinks;
        } catch (pdfErr) {
          AuditLoggerService.log({
            taskName: 'link_crawler',
            url,
            operation: 'extractPdf',
            status: 'WARN',
            error: String(pdfErr),
            retryCount: 0,
            durationMs: 0,
          });
        }
      } else {
        const htmlStr = typeof fetchRes.data === 'string'
          ? fetchRes.data
          : Buffer.from(fetchRes.data).toString('utf-8');

        const htmlParsed = HtmlExtractorService.extract(htmlStr, url);
        rawText = htmlParsed.cleanText;
        title = htmlParsed.title;
        discoveredLinks = [
          ...htmlParsed.discoveredPdfs,
          ...htmlParsed.outgoingLinks,
          ...htmlParsed.profileCandidateLinks,
        ];
      }

      const resource: DiscoveredResource = {
        url,
        parentUrl,
        depth,
        contentType: fetchRes.contentType,
        httpStatus: fetchRes.status,
        contentHash: fetchRes.contentHash,
        title,
        rawText,
        isPdf,
        discoveredLinks,
        pdfResult,
      };

      visited.set(url, resource);

      // If we haven't reached max depth, enqueue relevant children
      if (depth < maxDepth && visited.size < maxTotalPages) {
        for (const nextUrl of discoveredLinks) {
          if (visited.has(nextUrl)) continue;

          // Check relevance filter
          if (this.isRelevantChildUrl(nextUrl, domain, keywords)) {
            queue.push({
              url: nextUrl,
              depth: depth + 1,
              parentUrl: url,
            });
          }
        }
      }
    }

    return visited;
  }

  private static isRelevantChildUrl(
    url: string,
    parentDomain: string,
    keywords: string[]
  ): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = (parsed.pathname + parsed.search).toLowerCase();

      // Only follow URLs on the same root domain or academic subdomains
      const isSameOrSubDomain = host === parentDomain || host.endsWith('.' + parentDomain) || parentDomain.endsWith('.' + host);
      if (!isSameOrSubDomain && !path.endsWith('.pdf')) {
        return false;
      }

      // Check if path or filename contains any relevant keyword
      if (path.endsWith('.pdf')) return true;

      return keywords.some(kw => path.includes(kw));
    } catch {
      return false;
    }
  }
}
