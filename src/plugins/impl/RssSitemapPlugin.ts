
import { SourcePlugin } from '../SourcePlugin.js';
import {
  CollectedPage,
  RawInternship,
} from '../../models/DomainModels.js';
import { fetcherService } from '../../pipeline/FetcherService.js';
import { logger } from '../../utils/logger.js';
import Parser from 'rss-parser';

export class RssSitemapPlugin implements SourcePlugin {
  id = 'rss-sitemap';
  name = 'RSS Feed & XML Sitemap Collector';
  description =
    'Parses RSS and Atom feeds containing job announcements';

  private parser = new Parser();

  supports(url: string): boolean {
    return (
      /\.xml(?:[?#]|$)/i.test(url) ||
      /\/rss(?:[/?#]|$)/i.test(url) ||
      /\/feed(?:[/?#]|$)/i.test(url) ||
      /sitemap/i.test(url) ||
      /offerRss\.ashx/i.test(url)
    );
  }

  async discover(sourceUrl: string): Promise<string[]> {
    return [sourceUrl];
  }

  async collect(url: string): Promise<CollectedPage> {
    const { page } = await fetcherService.fetch(url);
    return page;
  }

  private inferCompany(sourceUrl: string): string {
    try {
      const hostname = new URL(sourceUrl).hostname.toLowerCase();

      if (hostname.endsWith('cea.fr')) return 'CEA';
      if (hostname.endsWith('cnrs.fr')) return 'CNRS';
      if (hostname.endsWith('ifpenergiesnouvelles.fr')) {
        return 'IFP Energies nouvelles';
      }

      return hostname.replace(/^www\./, '');
    } catch {
      return 'Unknown';
    }
  }

  private inferLocation(categories: string[] = []): string {
    const ignored = [
      'stage',
      'internship',
      'internship',
      'alternance',
      'cdi',
      'cdd',
      'mécanique et thermique',
      'energie',
      'énergie',
      'informatique',
      'recherche',
    ];

    const candidates = categories
      .map((category) => category.trim())
      .filter(Boolean)
      .filter(
        (category) =>
          !ignored.includes(category.toLowerCase())
      );

    if (candidates.length === 0) {
      return 'France';
    }

    return `${candidates[0]}, France`;
  }

  async normalize(
    page: CollectedPage
  ): Promise<RawInternship[]> {
    const internships: RawInternship[] = [];

    if (!page.content) return internships;

    try {
      const feed = await this.parser.parseString(page.content);
      const companyName = this.inferCompany(page.url);

      for (const item of feed.items || []) {
        if (!item.title || !item.link) continue;

        const title = item.title.trim();
        const description = String(
          item.contentSnippet || item.content || ''
        )
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const categories = (item.categories || []).map(
          (category) => String(category)
        );

        const location = this.inferLocation(categories);

        internships.push({
          title,
          companyName,
          location,
          description,
          applyUrl: item.link,
          stipendText: 'Not disclosed',
          deadlineText: item.pubDate || 'Open',
          rawSkills: categories,
          metadata: {
            source: page.url,
            categories,
            publishedAt: item.pubDate || null,
          },
        });
      }

      logger.info(
        `RSS normalization produced ${internships.length} listings from ${page.url}`
      );
    } catch (error) {
      logger.warn(
        `RSS parsing failed for ${page.url}`,
        { error: String(error) }
      );
    }

    return internships;
  }

  async healthCheck(sourceUrl: string): Promise<boolean> {
    try {
      const page = await this.collect(sourceUrl);
      return (
        page.statusCode >= 200 &&
        page.statusCode < 300 &&
        page.content.length > 0
      );
    } catch {
      return false;
    }
  }
}
