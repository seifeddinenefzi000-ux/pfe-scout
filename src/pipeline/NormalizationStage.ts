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
const companyName = this.cleanText(raw.companyName);

const location = raw.location
  ? this.cleanText(raw.location)
  : 'Unknown';

const isRemote =
  location.toLowerCase().includes('remote') ||
  location.toLowerCase().includes('work from home') ||
  location.toLowerCase().includes('télétravail');

const description = raw.description
  ? this.cleanText(raw.description)
  : `${title} opportunity at ${companyName}`;

const canonicalUrl = this.canonicalizeUrl(raw.applyUrl);

const rawContentString =
  `${title.toLowerCase()}|${companyName.toLowerCase()}|${canonicalUrl}`;

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
  stipendText: raw.stipendText || 'Unspecified',
  applyUrl: raw.applyUrl,
  canonicalUrl,
  contentHash,
  deadline: this.parseDeadline(raw.deadlineText),
  skills: raw.rawSkills || [],
  status: 'NORMALIZED',
  confidenceScore: 1.0,
};

}

private static cleanText(text: string): string {
return text.replace(/\s+/g, ' ').trim();
}

private static inferCountry(location: string): string {
const value = location.toLowerCase();

const countryMap: Record<string, string> = {
  france: 'France',
  french: 'France',
  paris: 'France',
  toulouse: 'France',
  grenoble: 'France',
  lyon: 'France',
  bordeaux: 'France',
  lille: 'France',
  nantes: 'France',
  strasbourg: 'France',
  marseille: 'France',
  montpellier: 'France',
  rennes: 'France',
  nice: 'France',

  germany: 'Germany',
  deutschland: 'Germany',
  berlin: 'Germany',
  munich: 'Germany',
  münchen: 'Germany',
  hamburg: 'Germany',
  frankfurt: 'Germany',

  belgium: 'Belgium',
  brussels: 'Belgium',
  bruxelles: 'Belgium',
  leuven: 'Belgium',
  ghent: 'Belgium',

  switzerland: 'Switzerland',
  suisse: 'Switzerland',
  geneva: 'Switzerland',
  genève: 'Switzerland',
  zurich: 'Switzerland',
  zürich: 'Switzerland',
  lausanne: 'Switzerland',
  basel: 'Switzerland',

  canada: 'Canada',
  quebec: 'Canada',
  québec: 'Canada',
  montreal: 'Canada',
  montréal: 'Canada',
  toronto: 'Canada',
  vancouver: 'Canada',
  ottawa: 'Canada',
  calgary: 'Canada',
  edmonton: 'Canada',

  'united states': 'United States',
  'united states of america': 'United States',
  usa: 'United States',
  california: 'United States',
  texas: 'United States',
  florida: 'United States',
  'new york': 'United States',
  boston: 'United States',
  chicago: 'United States',
  houston: 'United States',
  seattle: 'United States',
  colorado: 'United States',
  ohio: 'United States',
  virginia: 'United States',
  washington: 'United States',

  'united kingdom': 'United Kingdom',
  uk: 'United Kingdom',
  england: 'United Kingdom',
  london: 'United Kingdom',
  manchester: 'United Kingdom',
  oxford: 'United Kingdom',
  cambridge: 'United Kingdom',
  scotland: 'United Kingdom',

  netherlands: 'Netherlands',
  holland: 'Netherlands',
  amsterdam: 'Netherlands',
  eindhoven: 'Netherlands',
  rotterdam: 'Netherlands',
  delft: 'Netherlands',

  ireland: 'Ireland',
  dublin: 'Ireland',
  cork: 'Ireland',
  galway: 'Ireland',

  australia: 'Australia',
  sydney: 'Australia',
  melbourne: 'Australia',
  brisbane: 'Australia',
  perth: 'Australia',
  adelaide: 'Australia',

  india: 'India',
  indian: 'India',
  mumbai: 'India',
  bengaluru: 'India',
  bangalore: 'India',
  delhi: 'India',
  'new delhi': 'India',
  hyderabad: 'India',
  chennai: 'India',
  pune: 'India',

  tunisia: 'Tunisia',
  tunis: 'Tunisia',
  monastir: 'Tunisia',
  sousse: 'Tunisia',
  bizerte: 'Tunisia',
  sfax: 'Tunisia',
};

for (const [keyword, country] of Object.entries(countryMap)) {
  if (value.includes(keyword)) {
    return country;
  }
}

return 'Unknown';

}

public static canonicalizeUrl(rawUrl: string): string {
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

const clean = stipendText.replace(/,/g, '');
const matches = clean.match(/\d+(?:\.\d+)?/g);

let currency = 'EUR';

const upper = stipendText.toUpperCase();

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
  upper.includes('INR') ||
  stipendText.includes('₹')
) {
  currency = 'INR';
} else if (
  upper.includes('AUD')
) {
  currency = 'AUD';
} else if (
  upper.includes('TND')
) {
  currency = 'TND';
}

if (!matches || matches.length === 0) {
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

const timestamp = Date.parse(deadlineText);

if (!isNaN(timestamp)) {
  return new Date(timestamp).toISOString();
}

return null;

}
}
