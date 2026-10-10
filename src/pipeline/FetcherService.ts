import axios, { AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { CollectedPage } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export interface CacheEntry {
  etag?: string;
  lastModified?: string;
  contentHash: string;
  cachedAt: string;
}

export class FetcherService {
  private cache = new Map<string, CacheEntry>();

  async fetch(url: string, options: { crawlDelayMs?: number; userAgent?: string } = {}): Promise<{ page: CollectedPage; skippedCache: boolean }> {
    const cached = this.cache.get(url);
    const headers: Record<string, string> = {
      'User-Agent': options.userAgent || 'AtlasInternAI-Bot/1.0 (+https://github.com/atlas-intern-ai)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,json;q=0.8,*/*;q=0.7',
    };

    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }
    if (cached?.lastModified) {
      headers['If-Modified-Since'] = cached.lastModified;
    }

    if (options.crawlDelayMs && options.crawlDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.crawlDelayMs));
    }

    try {
      const config: AxiosRequestConfig = {
        headers,
        validateStatus: (status: number) => status >= 200 && status < 400,
        timeout: 15000,
      };

      const response = await axios.get(url, config);

      if (response.status === 304) {
        logger.info(`HTTP 304 Cache Hit for ${url}`);
        return {
          page: {
            url,
            content: '',
            headers: response.headers as Record<string, string>,
            etag: cached?.etag,
            lastModified: cached?.lastModified,
            statusCode: 304,
            fetchedAt: new Date().toISOString(),
          },
          skippedCache: true,
        };
      }

      const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const etag = response.headers['etag'] as string | undefined;
      const lastModified = response.headers['last-modified'] as string | undefined;
      const contentHash = crypto.createHash('md5').update(content).digest('hex');

      this.cache.set(url, {
        etag,
        lastModified,
        contentHash,
        cachedAt: new Date().toISOString(),
      });

      return {
        page: {
          url,
          content,
          headers: response.headers as Record<string, string>,
          etag,
          lastModified,
          statusCode: response.status,
          fetchedAt: new Date().toISOString(),
        },
        skippedCache: false,
      };
    } catch (err) {
      logger.error(`Failed fetching URL: ${url}`, { error: String(err) });
      throw err;
    }
  }

  async fetchBinary(url: string, timeoutMs = 20000): Promise<Uint8Array | null> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
        },
      });
      return new Uint8Array(response.data);
    } catch (err) {
      logger.warn(`Failed fetching binary from ${url}`, { error: String(err) });
      return null;
    }
  }
}

export const fetcherService = new FetcherService();
