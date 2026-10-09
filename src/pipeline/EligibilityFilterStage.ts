import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export class EligibilityFilterStage {
  process(
    items: CanonicalInternship[]
  ): {
    filtered: CanonicalInternship[];
    rejectedCount: number;
  } {
    const filtered: CanonicalInternship[] = [];
    let rejectedCount = 0;
    const now = new Date('2026-10-09');

    // ------------------------------------------------------------
    // 1. Strict Location Exclusions: Tunisia, Germany, USA / North American job boards
    // ------------------------------------------------------------
    const excludedLocationSignals = [
      'tunisia',
      'tunisie',
      'tunis',
      'monastir',
      'sousse',
      'sfax',
      'germany',
      'deutschland',
      'allemagne',
      'berlin',
      'munich',
      'münchen',
      'stuttgart',
      'frankfurt',
      'hamburg',
      'united states',
      'usa',
      'california',
      'texas',
      'new york',
      'seattle',
      'san francisco',
      'remote us',
      'us only',
      'austin',
      'boston',
      'chicago',
    ];

    const targetEnergyDomainKeywords = [
      'renouvelable',
      'renewable',
      'solaire',
      'solar',
      'photovolta',
      'pv',
      'bess',
      'batterie',
      'battery',
      'stockage',
      'storage',
      'step',
      'pompage',
      'turbinage',
      'hydroélectr',
      'hydroelectr',
      'hydrogène',
      'hydrogen',
      'volant d’inertie',
      'volant d\'inertie',
      'flywheel',
      'air comprimé',
      'caes',
      'microgrid',
      'smart grid',
      'réseau électrique',
      'reseau electrique',
      'intégration réseau',
      'gestion d\'énergie',
      'ems',
      'onduleur',
      'convertisseur',
      'électronique de puissance',
      'thermique',
      'thermal',
      'chaleur',
      'échangeur',
      'echangeur',
      'thermodynamique',
      'cfd',
      'efficacité énergétique',
      'décarbonation',
      'ubem',
    ];

    const seniorOrCdiKeywords = [
      'senior',
      'lead engineer',
      'staff engineer',
      'principal engineer',
      'engineering manager',
      'director',
      'cdi',
      'permanent full-time',
    ];

    for (const item of items) {
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const locLower = (item.location || '').toLowerCase();
      const companyLower = (item.companyName || '').toLowerCase();
      const combined = `${titleLower} ${descLower} ${locLower} ${companyLower}`;

      // 1. Strict Exclusions: Tunisia, Germany, USA
      const isExcluded = excludedLocationSignals.some((sig) => {
        const regex = new RegExp(`\\b${sig}\\b`, 'i');
        return regex.test(locLower) || (locLower.includes(sig) && !locLower.includes('france'));
      });

      if (isExcluded) {
        logger.info(`Rejected item "${item.title}" due to excluded location: ${item.location}`);
        rejectedCount++;
        continue;
      }

      // 2. Reject permanent full-time senior jobs (only internships/theses allowed)
      const isSenior = seniorOrCdiKeywords.some((s) => titleLower.includes(s) && !titleLower.includes('intern') && !titleLower.includes('stage'));
      if (isSenior) {
        logger.info(`Rejected item "${item.title}" - full time senior role.`);
        rejectedCount++;
        continue;
      }

      // 3. Strict Date & Deadline Verification (Reject expired offers)
      if (item.deadline) {
        const deadlineDate = new Date(item.deadline);
        if (!isNaN(deadlineDate.getTime()) && deadlineDate < now) {
          logger.info(`Rejected item "${item.title}" - expired deadline: ${item.deadline}`);
          rejectedCount++;
          continue;
        }
      }

      // 4. Ensure target Energy & Storage domain match
      const hasTargetDomainMatch = targetEnergyDomainKeywords.some((kw) => combined.includes(kw));
      if (!hasTargetDomainMatch) {
        logger.info(`Rejected item "${item.title}" - does not match target Energy/Storage/PV/Microgrid focus`);
        rejectedCount++;
        continue;
      }

      // 5. Country Tagging
      if (locLower.includes('canada') || locLower.includes('quebec') || locLower.includes('montreal') || companyLower.includes('hydro-québec')) {
        item.country = 'Canada';
      } else if (locLower.includes('switzerland') || locLower.includes('suisse') || locLower.includes('epfl') || locLower.includes('eth')) {
        item.country = 'Switzerland';
      } else if (locLower.includes('australia') || locLower.includes('sydney') || locLower.includes('unsw')) {
        item.country = 'Australia';
      } else if (locLower.includes('uk') || locLower.includes('oxford') || locLower.includes('london')) {
        item.country = 'UK';
      } else {
        item.country = 'France';
      }

      // 6. Gratification / Stipend text
      if (item.country === 'France') {
        item.stipendText = item.stipendText && item.stipendText !== 'Not disclosed' && item.stipendText !== 'Unspecified'
          ? item.stipendText
          : 'Gratification légale (France ~650€ - 1200€/mois)';
      } else {
        item.stipendText = item.stipendText || 'Gratification / Research Stipend';
      }

      filtered.push(item);
    }

    logger.info(
      `EligibilityFilterStage: Filtered ${items.length} -> kept ${filtered.length} target PFE offers, rejected ${rejectedCount}.`
    );

    return {
      filtered,
      rejectedCount,
    };
  }
}
