import { CanonicalInternship } from '../models/DomainModels.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class CountryFilterStage {
  process(items: CanonicalInternship[]): {
    filtered: CanonicalInternship[];
    rejectedCount: number;
  } {
    if (env.ALLOW_INTERNATIONAL) {
      logger.info(
        'International internships allowed by configuration.'
      );

      return {
        filtered: items,
        rejectedCount: 0,
      };
    }

    const filtered: CanonicalInternship[] = [];
    let rejectedCount = 0;

    /*
     * PFE Scout is international by default.
     *
     * We only reject opportunities when there is strong evidence
     * that they are located in Tunisia.
     */

    const tunisiaKeywords = [
      'tunisia',
      'tunis',
      'tunisie',
      'monastir',
      'sousse',
      'sfax',
      'bizerte',
      'gabes',
      'gabès',
      'nabeul',
      'hammamet',
      'mahdia',
      'kairouan',
      'kasserine',
      'ariana',
      'ben arous',
      'menzah',
      'lac 1',
      'lac 2',
    ];

    for (const item of items) {
      const locLower = item.location.toLowerCase();
      const countryLower = item.country.toLowerCase();

      const isTunisia = tunisiaKeywords.some(
        (keyword) =>
          locLower.includes(keyword) ||
          countryLower.includes(keyword)
      );

      if (isTunisia) {
        rejectedCount++;

        logger.debug(
          `Rejected Tunisia opportunity: ${item.title} | ${item.location}`
        );

        continue;
      }

      /*
       * Keep international and unknown-location opportunities.
       */

      filtered.push(item);
    }

    logger.info(
      `International CountryFilterStage: Kept ${filtered.length} international listings, rejected ${rejectedCount} Tunisia listings.`
    );

    return {
      filtered,
      rejectedCount,
    };
  }
}