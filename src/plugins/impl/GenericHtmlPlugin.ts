import { SourcePlugin } from '../SourcePlugin.js';
import { CollectedPage, RawInternship } from '../../models/DomainModels.js';
import { fetcherService } from '../../pipeline/FetcherService.js';
import { logger } from '../../utils/logger.js';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';

export class GenericHtmlPlugin implements SourcePlugin {
  id = 'generic-html';
  name = 'Generic HTML & Lab Portal Scraper';
  description = 'Cheerio HTML scraper with WordPress, lab portal, and RSS auto-discovery support';

  private rssParser = new Parser();

  supports(url: string): boolean {
    return true; // Fallback for all HTTP/HTTPS web pages
  }

  async discover(sourceUrl: string): Promise<string[]> {
    return [sourceUrl];
  }

  async collect(url: string): Promise<CollectedPage> {
    const { page } = await fetcherService.fetch(url);
    return page;
  }

  private inferCompany(url: string, pageTitle: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('promes.cnrs.fr')) return 'CNRS PROMES (Procédés, Matériaux et Énergie Solaire)';
    if (lowerUrl.includes('laplace.univ-tlse.fr')) return 'LAPLACE (Laboratoire Plasma et Conversion d’Énergie)';
    if (lowerUrl.includes('cea.fr')) return 'CEA';
    if (lowerUrl.includes('cnrs.fr')) return 'CNRS';
    if (lowerUrl.includes('ifpenergiesnouvelles.fr')) return 'IFP Energies nouvelles';
    if (lowerUrl.includes('ines-solaire.org')) return 'INES (Institut National de l’Énergie Solaire)';

    if (pageTitle && pageTitle.length > 2) {
      const cleanTitle = pageTitle.split(/[-–|]/)[0].trim();
      if (cleanTitle.length > 2 && cleanTitle.length < 50) return cleanTitle;
    }

    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return hostname.split('.')[0].toUpperCase();
    } catch {
      return 'Research Organization';
    }
  }

  private inferLocation(url: string, text: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('promes.cnrs.fr')) return 'Font-Romeu / Odeillo / Perpignan, France';
    if (lowerUrl.includes('laplace.univ-tlse.fr')) return 'Toulouse, France';
    if (lowerUrl.includes('ines-solaire.org')) return 'Le Bourget-du-Lac, France';
    if (lowerUrl.includes('.fr')) return 'France';

    const textLower = text.toLowerCase();
    if (textLower.includes('toulouse')) return 'Toulouse, France';
    if (textLower.includes('grenoble')) return 'Grenoble, France';
    if (textLower.includes('paris')) return 'Paris, France';
    if (textLower.includes('lyon')) return 'Lyon, France';
    if (textLower.includes('france')) return 'France';

    return 'France';
  }

  async normalize(page: CollectedPage): Promise<RawInternship[]> {
    const internships: RawInternship[] = [];
    if (!page.content) return internships;

    const $ = cheerio.load(page.content);

    // 1. Check if the page advertises an RSS feed link (common on WordPress lab sites like PROMES)
    const rssLink = $('link[type="application/rss+xml"]').attr('href');
    if (rssLink) {
      try {
        let feedUrl = rssLink;
        if (!feedUrl.startsWith('http')) {
          feedUrl = new URL(feedUrl, page.url).toString();
        }
        logger.info(`GenericHtmlPlugin: detected RSS feed link: ${feedUrl}`);
        const { page: rssPage } = await fetcherService.fetch(feedUrl);
        if (rssPage && rssPage.content) {
          const feed = await this.rssParser.parseString(rssPage.content);
          const defaultCompany = this.inferCompany(page.url, feed.title || $('title').text());

          for (const item of feed.items || []) {
            if (!item.title || !item.link) continue;
            const title = item.title.trim();
            // Skip the feed archive page title itself if echoed
            if (title.toLowerCase().startsWith('archives des') || title.toLowerCase() === feed.title?.toLowerCase()) {
              continue;
            }

            const snippet = String(item.contentSnippet || item.content || '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            internships.push({
              title,
              companyName: defaultCompany,
              location: this.inferLocation(page.url, `${title} ${snippet}`),
              description: snippet,
              applyUrl: item.link,
              stipendText: 'Gratification légale (France)',
              deadlineText: item.pubDate || 'Open',
              rawSkills: (item.categories || []).map(String),
            });
          }

          if (internships.length > 0) {
            logger.info(`GenericHtmlPlugin: successfully extracted ${internships.length} listings from discovered RSS feed`);
            return internships;
          }
        }
      } catch (err) {
        logger.warn(`GenericHtmlPlugin: RSS auto-discovery failed for ${page.url}`, { error: String(err) });
      }
    }

    // 2. HTML Card & Article Extraction
    const defaultCompany = this.inferCompany(page.url, $('title').text());

    // Match standard job selectors AND WordPress articles, listings, cards
    const selectors = [
      'article',
      '.job-card',
      '.job-item',
      '.career-item',
      '.listing-item',
      '.type-post',
      '.entry',
      '.wp-block-post',
      '.offre-item',
      '.offre',
      'tr',
    ];

    $(selectors.join(', ')).each((_: number, el: any) => {
      const headingEl = $(el).find('h1, h2, h3, h4, .entry-title, .job-title, .title, a').first();
      const title = headingEl.text().trim();
      const linkEl = $(el).is('a') ? $(el) : $(el).find('a').first();
      const href = linkEl.attr('href');

      const companyText = $(el).find('.company, .company-name, .employer').first().text().trim();
      const locationText = $(el).find('.location, .city').first().text().trim();
      const snippet = $(el).find('p, .entry-content, .excerpt, .description').first().text().trim();

      if (title && title.length > 10) {
        // Skip obvious header or navigation text
        const titleLower = title.toLowerCase();
        if (titleLower.includes('menu') || titleLower.includes('navigation') || titleLower.includes('accueil') || titleLower.includes('archives')) {
          return;
        }

        let applyUrl = page.url;
        if (href) {
          try {
            applyUrl = new URL(href, page.url).toString();
          } catch {
            applyUrl = page.url;
          }
        }

        internships.push({
          title,
          companyName: companyText || defaultCompany,
          location: locationText ? `${locationText}, France` : this.inferLocation(page.url, `${title} ${snippet}`),
          description: snippet || title,
          applyUrl,
          stipendText: 'Gratification légale (France)',
        });
      }
    });

    return internships;
  }

  async healthCheck(sourceUrl: string): Promise<boolean> {
    try {
      const page = await this.collect(sourceUrl);
      return page.statusCode >= 200 && page.statusCode < 400;
    } catch {
      return false;
    }
  }
}
