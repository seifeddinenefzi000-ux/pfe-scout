
import crypto from 'crypto';

import {
  RawInternship,
  CanonicalInternship,
} from '../models/DomainModels.js';

export class NormalizationStage {
  public static toCanonical(
    raw: RawInternship,
    sourceId?: string
  ): CanonicalInternship {
    const title = this.cleanText(raw.title);

    const companyName = this.cleanText(
      raw.companyName
    );

    const location = raw.location
      ? this.cleanText(raw.location)
      : 'Unknown';

    const isRemote =
      location.toLowerCase().includes('remote') ||
      location
        .toLowerCase()
        .includes('work from home') ||
      location
        .toLowerCase()
        .includes('télétravail');

    const description = raw.description
      ? this.cleanText(raw.description)
      : `${title} opportunity at ${companyName}`;

    const canonicalUrl =
      this.canonicalizeUrl(raw.applyUrl);

    const rawContentString =
      `${title.toLowerCase()}|` +
      `${companyName.toLowerCase()}|` +
      `${canonicalUrl}`;

    const contentHash = crypto
      .createHash('md5')
      .update(rawContentString)
      .digest('hex');

    const {
      min: stipendMin,
      max: stipendMax,
      currency: stipendCurrency,
    } = this.parseStipend(raw.stipendText);

    return {
      sourceId,
      companyName,
      title,
      description,
      location,
      country: this.inferCountry(location),
      isRemote,
      stipendMin,
      stipendMax,
      stipendCurrency,
      stipendText:
        raw.stipendText || 'Unspecified',
      applyUrl: raw.applyUrl,
      canonicalUrl,
      contentHash,
      deadline: this.parseDeadline(
        raw.deadlineText
      ),
      skills: raw.rawSkills || [],
      status: 'NORMALIZED',
      confidenceScore: 1.0,
    };
  }

  private static cleanText(
    text: string
  ): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private static inferCountry(
    location: string
  ): string {
    const value =
      location.toLowerCase().trim();

    const countryKeywords: Array<{
      country: string;
      keywords: string[];
    }> = [
      {
        country: 'France',
        keywords: [
          'france',
          'french',
          'paris',
          'toulouse',
          'grenoble',
          'lyon',
          'bordeaux',
          'lille',
          'nantes',
          'strasbourg',
          'marseille',
          'montpellier',
          'rennes',
          'nice',
        ],
      },

      {
        country: 'Germany',
        keywords: [
          'germany',
          'deutschland',
          'berlin',
          'munich',
          'münchen',
          'hamburg',
          'frankfurt',
        ],
      },

      {
        country: 'Belgium',
        keywords: [
          'belgium',
          'brussels',
          'bruxelles',
          'leuven',
          'ghent',
        ],
      },

      {
        country: 'Switzerland',
        keywords: [
          'switzerland',
          'suisse',
          'geneva',
          'genève',
          'zurich',
          'zürich',
          'lausanne',
          'basel',
        ],
      },

      {
        country: 'Canada',
        keywords: [
          'canada',
          'quebec',
          'québec',
          'montreal',
          'montréal',
          'toronto',
          'vancouver',
          'ottawa',
          'calgary',
          'edmonton',
        ],
      },

      {
        country: 'United States',
        keywords: [
          'united states',
          'united states of america',
          'usa',
          'california',
          'texas',
          'florida',
          'new york',
          'boston',
          'chicago',
          'houston',
          'seattle',
          'colorado',
          'ohio',
          'virginia',
          'washington',
        ],
      },

      {
        country: 'United Kingdom',
        keywords: [
          'united kingdom',
          'uk',
          'england',
          'london',
          'manchester',
          'oxford',
          'cambridge',
          'scotland',
        ],
      },

      {
        country: 'Netherlands',
        keywords: [
          'netherlands',
          'holland',
          'amsterdam',
          'eindhoven',
          'rotterdam',
          'delft',
        ],
      },

      {
        country: 'Ireland',
        keywords: [
          'ireland',
          'dublin',
          'cork',
          'galway',
        ],
      },

      {
        country: 'Australia',
        keywords: [
          'australia',
          'sydney',
          'melbourne',
          'brisbane',
          'perth',
          'adelaide',
        ],
      },

      {
        country: 'Tunisia',
        keywords: [
          'tunisia',
          'tunisie',
          'tunis',
          'monastir',
          'sousse',
          'bizerte',
          'sfax',
        ],
      },
    ];

    /*
     * First detect explicit country and city names.
     */
    for (const group of countryKeywords) {
      for (const keyword of group.keywords) {
        if (value.includes(keyword)) {
          return group.country;
        }
      }
    }

    /*
     * US state abbreviations.
     *
     * Match them as standalone tokens so
     * abbreviations such as "CA", "TX", and
     * "OH" do not accidentally match ordinary
     * words.
     */
    const usStateAbbreviations =
      new Set([
        'AL',
        'AK',
        'AZ',
        'AR',
        'CA',
        'CO',
        'CT',
        'DE',
        'FL',
        'GA',
        'HI',
        'ID',
        'IL',
        'IN',
        'IA',
        'KS',
        'KY',
        'LA',
        'ME',
        'MD',
        'MA',
        'MI',
        'MN',
        'MS',
        'MO',
        'MT',
        'NE',
        'NV',
        'NH',
        'NJ',
        'NM',
        'NY',
        'NC',
        'ND',
        'OH',
        'OK',
        'OR',
        'PA',
        'RI',
        'SC',
        'SD',
        'TN',
        'TX',
        'UT',
        'VT',
        'VA',
        'WA',
        'WV',
        'WI',
        'WY',
      ]);

    const tokens = location
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(Boolean);

    if (
      tokens.some((token) =>
        usStateAbbreviations.has(token)
      )
    ) {
      return 'United States';
    }

    /*
     * Remote or Hybrid alone does not identify
     * a country.
     */
    return 'Unknown';
  }

  public static canonicalizeUrl(
    rawUrl: string
  ): string {
    try {
      const parsed = new URL(rawUrl);

      parsed.hash = '';

      [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'ref',
        'source',
      ].forEach((param) => {
        parsed.searchParams.delete(param);
      });

      let href = parsed.toString();

      if (href.endsWith('/')) {
        href = href.slice(0, -1);
      }

      return href;
    } catch {
      return rawUrl.trim().toLowerCase();
    }
  }

  private static parseStipend(
    stipendText?: string
  ): {
    min: number | null;
    max: number | null;
    currency: string;
  } {
    if (!stipendText) {
      return {
        min: null,
        max: null,
        currency: 'EUR',
      };
    }

    const clean =
      stipendText.replace(/,/g, '');

    const matches = clean.match(
      /\d+(?:\.\d+)?/g
    );

    let currency = 'EUR';

    const upper =
      stipendText.toUpperCase();

    if (
      stipendText.includes('$') ||
      upper.includes('USD')
    ) {
      currency = 'USD';
    } else if (
      stipendText.includes('€') ||
      upper.includes('EUR')
    ) {
      currency = 'EUR';
    } else if (
      upper.includes('CAD')
    ) {
      currency = 'CAD';
    } else if (
      upper.includes('GBP') ||
      stipendText.includes('£')
    ) {
      currency = 'GBP';
    } else if (
      upper.includes('CHF')
    ) {
      currency = 'CHF';
    } else if (
      upper.includes('AUD')
    ) {
      currency = 'AUD';
    } else if (
      upper.includes('TND')
    ) {
      currency = 'TND';
    }

    if (
      !matches ||
      matches.length === 0
    ) {
      return {
        min: null,
        max: null,
        currency,
      };
    }

    const nums = matches.map(Number);

    if (nums.length === 1) {
      return {
        min: nums[0],
        max: nums[0],
        currency,
      };
    }

    return {
      min: Math.min(...nums),
      max: Math.max(...nums),
      currency,
    };
  }

  private static parseDeadline(
    deadlineText?: string
  ): string | null {
    if (
      !deadlineText ||
      deadlineText.toLowerCase() === 'open'
    ) {
      return null;
    }

    const timestamp =
      Date.parse(deadlineText);

    if (!isNaN(timestamp)) {
      return new Date(
        timestamp
      ).toISOString();
    }

    return null;
  }
}

