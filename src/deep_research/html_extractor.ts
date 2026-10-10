import * as cheerio from 'cheerio';
import { URL } from 'url';

export interface ExtractedJsonLdOffer {
  title?: string;
  description?: string;
  organization?: string;
  datePosted?: string;
  validThrough?: string;
  location?: string;
  employmentType?: string;
  directApply?: boolean;
}

export interface HtmlExtractionResult {
  title: string;
  cleanText: string;
  metaDescription?: string;
  jsonLdOffers: ExtractedJsonLdOffer[];
  jsonLdJobs: ExtractedJsonLdOffer[];
  links: string[];
  outgoingLinks: string[];
  mailtos: string[];
  pdfUrls: string[];
  discoveredPdfs: string[];
  profileCandidateLinks: string[];
  requiresJs: boolean;
  evidenceSnippets: string[];
}

export class HtmlExtractorService {
  /**
   * Comprehensive HTML entity decoder
   */
  decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è')
      .replace(/&ecirc;/g, 'ê')
      .replace(/&euml;/g, 'ë')
      .replace(/&agrave;/g, 'à')
      .replace(/&acirc;/g, 'â')
      .replace(/&ccedil;/g, 'ç')
      .replace(/&icirc;/g, 'î')
      .replace(/&iuml;/g, 'ï')
      .replace(/&ocirc;/g, 'ô')
      .replace(/&ugrave;/g, 'ù')
      .replace(/&ucirc;/g, 'û')
      .replace(/&uuml;/g, 'ü')
      .replace(/&ndash;/g, '–')
      .replace(/&mdash;/g, '—')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  /**
   * Unicode normalization without corrupting email addresses
   */
  normalizeUnicode(text: string): string {
    if (!text) return '';
    return text.normalize('NFKC');
  }

  /**
   * Main extractor parsing raw HTML into clean structured content
   */
  extract(htmlContent: string, baseUrl: string): HtmlExtractionResult {
    const $ = cheerio.load(htmlContent);

    // 1. Title & Meta
    const rawTitle = $('title').first().text() || $('h1').first().text() || '';
    const title = this.normalizeUnicode(this.decodeHtmlEntities(rawTitle.trim()));
    const metaDescription = $('meta[name="description"]').attr('content') || undefined;

    // 2. JSON-LD JobPosting Extraction
    const jsonLdOffers: ExtractedJsonLdOffer[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (item['@type'] === 'JobPosting' || item['@type'] === 'Posting') {
              jsonLdOffers.push({
                title: item.title,
                description: item.description,
                organization: item.hiringOrganization?.name,
                datePosted: item.datePosted,
                validThrough: item.validThrough,
                location: item.jobLocation?.address?.addressLocality,
                employmentType: item.employmentType,
                directApply: item.directApply,
              });
            }
          }
        }
      } catch {}
    });

    // 3. Link, Mailto & PDF Discovery
    const links: string[] = [];
    const mailtos: string[] = [];
    const pdfUrls: string[] = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')?.trim() || '';
      if (!href) return;

      if (href.startsWith('mailto:')) {
        const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (email.includes('@') && !mailtos.includes(email)) {
          mailtos.push(email);
        }
        return;
      }

      if (href.startsWith('javascript:') || href.startsWith('#')) return;

      try {
        const absolute = new URL(href, baseUrl).toString();
        if (!links.includes(absolute)) {
          links.push(absolute);
        }
        if (absolute.toLowerCase().includes('.pdf') && !pdfUrls.includes(absolute)) {
          pdfUrls.push(absolute);
        }
      } catch {}
    });

    // 4. JavaScript Rendering Detection
    const hasNoscript = $('noscript').length > 0 && $('noscript').text().toLowerCase().includes('javascript');
    const isSpaContainer = $('#root, #app, #__next').length > 0 && $('body').text().trim().length < 250;
    const requiresJs = hasNoscript || isSpaContainer;

    // 5. Clean text extraction without boilerplate
    $('script, style, noscript, nav, footer, header, aside, .menu, .nav, .sidebar, .cookie, .banner').remove();

    const rawBodyText = $('body').text() || $.text() || '';
    const decoded = this.decodeHtmlEntities(rawBodyText);
    const cleanText = this.normalizeUnicode(
      decoded
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim()
    );

    // 6. Evidence snippets (sentences with stage/PFE/superviseur/contact/dates)
    const sentences = cleanText.split(/[\n.!?]+/);
    const evidenceKeywords = ['stage', 'pfe', 'encadrant', 'tuteur', 'durée', 'gratification', 'contact', 'janvier', 'février', 'batterie', 'solaire', 'microgrid', 'hydrogène'];
    const evidenceSnippets = sentences
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 300)
      .filter((s) => {
        const lower = s.toLowerCase();
        return evidenceKeywords.some((kw) => lower.includes(kw));
      })
      .slice(0, 15);

    const profileCandidateLinks = links.filter((l) => {
      const lower = l.toLowerCase();
      return (
        lower.includes('equipe') ||
        lower.includes('team') ||
        lower.includes('chercheur') ||
        lower.includes('people') ||
        lower.includes('profile') ||
        lower.includes('staff') ||
        lower.includes('contact')
      );
    });

    return {
      title,
      cleanText,
      metaDescription,
      jsonLdOffers,
      jsonLdJobs: jsonLdOffers,
      links,
      outgoingLinks: links,
      mailtos,
      pdfUrls,
      discoveredPdfs: pdfUrls,
      profileCandidateLinks,
      requiresJs,
      evidenceSnippets,
    };
  }

  static extract(htmlContent: string, baseUrl: string): HtmlExtractionResult {
    return htmlExtractor.extract(htmlContent, baseUrl);
  }
}

export const htmlExtractor = new HtmlExtractorService();
