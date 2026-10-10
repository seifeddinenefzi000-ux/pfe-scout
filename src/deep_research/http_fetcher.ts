import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { URL } from 'url';
import dns from 'dns/promises';
import { auditLogger } from './audit_logger.js';
import { logger } from '../utils/logger.js';

export interface FetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxRetries?: number;
  userAgent?: string;
  delayMs?: number;
  maxSizeBytes?: number; // default 20MB
}

export interface FetchResult {
  url: string;
  canonicalUrl: string;
  status: number;
  contentType: string;
  contentHash: string;
  buffer: Buffer;
  text: string;
  isPdf: boolean;
  isHtml: boolean;
  headers: Record<string, string>;
  durationMs: number;
}

export class SafeHttpFetcherService {
  private domainLastFetchTime = new Map<string, number>();
  private defaultUserAgent = 'PFEScoutResearchBot/2.0 (+https://github.com/seifeddinenefzi000-ux/pfe-scout)';

  /**
   * SSRF Protection: Validates whether a URL is a safe public target
   */
  async isSafePublicUrl(targetUrl: string): Promise<{ safe: boolean; reason?: string }> {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Block local/internal hostnames
      if (
        hostname === 'localhost' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname === 'metadata.google.internal'
      ) {
        return { safe: false, reason: `Blocked private host: ${hostname}` };
      }

      // Resolve DNS to verify IP address
      let addresses: string[] = [];
      try {
        const lookup = await dns.lookup(hostname, { all: true });
        addresses = lookup.map((l) => l.address);
      } catch (dnsErr) {
        // If it's already an IP literal
        addresses = [hostname];
      }

      for (const ip of addresses) {
        if (this.isPrivateOrLoopbackIp(ip)) {
          return { safe: false, reason: `Blocked private IP destination: ${ip}` };
        }
      }

      return { safe: true };
    } catch (err) {
      return { safe: false, reason: `Malformed URL: ${String(err)}` };
    }
  }

  /**
   * Checks whether an IP belongs to loopback, private ranges, or cloud metadata
   */
  private isPrivateOrLoopbackIp(ip: string): boolean {
    // IPv4 Loopback (127.0.0.0/8)
    if (ip.startsWith('127.')) return true;

    // IPv6 Loopback
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;

    // Private IPv4 ranges
    if (ip.startsWith('10.')) return true; // 10.0.0.0/8
    if (ip.startsWith('192.168.')) return true; // 192.168.0.0/16
    if (ip.startsWith('169.254.')) return true; // Link-local & cloud metadata (169.254.169.254)

    // 172.16.0.0/12
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }

    // 0.0.0.0/8
    if (ip.startsWith('0.')) return true;

    // IPv6 Unique Local Address fc00::/7 or Link-local fe80::/10
    if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd') || ip.toLowerCase().startsWith('fe80')) {
      return true;
    }

    return false;
  }

  /**
   * Rate-limiting per domain to respect server crawling etiquette
   */
  private async enforceDomainRateLimit(domain: string, delayMs = 500): Promise<void> {
    const now = Date.now();
    const last = this.domainLastFetchTime.get(domain) || 0;
    const elapsed = now - last;
    if (elapsed < delayMs) {
      await new Promise((res) => setTimeout(res, delayMs - elapsed));
    }
    this.domainLastFetchTime.set(domain, Date.now());
  }

  /**
   * Executes a robust, bounded HTTP request with SSRF guard and retries
   */
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const startTime = Date.now();
    const maxRetries = options.maxRetries ?? 2;
    const timeoutMs = options.timeoutMs ?? 15000;
    const maxSizeBytes = options.maxSizeBytes ?? 20 * 1024 * 1024; // 20 MB

    // 1. SSRF Safety Check
    const ssrfCheck = await this.isSafePublicUrl(url);
    if (!ssrfCheck.safe) {
      auditLogger.record({
        taskName: 'http_fetcher',
        url,
        operation: 'ssrf_check',
        status: 'ERROR',
        error: ssrfCheck.reason,
        retryCount: 0,
        durationMs: Date.now() - startTime,
      });
      throw new Error(`SSRF Guard rejected request to ${url}: ${ssrfCheck.reason}`);
    }

    const domain = new URL(url).hostname;
    await this.enforceDomainRateLimit(domain, options.delayMs || 300);

    let currentUrl = url;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const config: AxiosRequestConfig = {
          url: currentUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: timeoutMs,
          maxRedirects: options.maxRedirects ?? 5,
          headers: {
            'User-Agent': options.userAgent || this.defaultUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          validateStatus: (status) => status >= 200 && status < 400,
        };

        const response: AxiosResponse = await axios(config);
        const buffer = Buffer.from(response.data);

        if (buffer.length > maxSizeBytes) {
          throw new Error(`Response payload size (${buffer.length} bytes) exceeds limit (${maxSizeBytes} bytes)`);
        }

        const rawContentType = String(response.headers['content-type'] || '').toLowerCase();
        const isPdf = rawContentType.includes('pdf') || buffer.slice(0, 5).toString() === '%PDF-';
        const isHtml = rawContentType.includes('html') || (!isPdf && buffer.slice(0, 50).toString().includes('<html'));
        const text = isPdf ? '' : buffer.toString('utf-8');

        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const canonicalUrl = (response.request?.res?.responseUrl as string) || currentUrl;

        const durationMs = Date.now() - startTime;
        auditLogger.record({
          taskName: 'http_fetcher',
          url,
          operation: 'http_get',
          status: 'SUCCESS',
          retryCount: attempt,
          durationMs,
        });

        const headersMap: Record<string, string> = {};
        for (const [k, v] of Object.entries(response.headers)) {
          if (typeof v === 'string') headersMap[k.toLowerCase()] = v;
        }

        return {
          url,
          canonicalUrl,
          status: response.status,
          contentType: rawContentType,
          contentHash: hash,
          buffer,
          text,
          isPdf,
          isHtml,
          headers: headersMap,
          durationMs,
        };
      } catch (err: any) {
        attempt++;
        lastError = err;
        logger.warn(`[http_fetcher] Attempt ${attempt} failed for ${url}: ${err.message}`);
        if (attempt <= maxRetries) {
          const backoff = Math.pow(2, attempt) * 500;
          await new Promise((res) => setTimeout(res, backoff));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    auditLogger.record({
      taskName: 'http_fetcher',
      url,
      operation: 'http_get',
      status: 'ERROR',
      error: lastError?.message || 'Unknown fetch error',
      retryCount: attempt - 1,
      durationMs,
    });

    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
  }

  static async fetch(
    url: string,
    options: FetchOptions = {}
  ): Promise<{
    ok: boolean;
    status: number;
    contentType: string;
    contentHash: string;
    data: Buffer | string | null;
    error?: string;
  }> {
    try {
      const res = await safeHttpFetcher.fetch(url, options);
      return {
        ok: true,
        status: res.status,
        contentType: res.contentType,
        contentHash: res.contentHash,
        data: res.isPdf ? res.buffer : res.text,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        contentType: '',
        contentHash: '',
        data: null,
        error: err.message,
      };
    }
  }
}

export const safeHttpFetcher = new SafeHttpFetcherService();
