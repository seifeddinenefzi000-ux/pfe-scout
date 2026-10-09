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

    // ------------------------------------------------------------
    // 1. Explicit Country Exclusions (Tunisia & Germany)
    // ------------------------------------------------------------
    const excludedCountrySignals = [
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
    ];

    // Allowed / Prioritized target regions: France (Top Priority)
    const franceSignals = ['france', 'paris', 'toulouse', 'grenoble', 'lyon', 'bordeaux', 'marseille', 'montpellier', 'perpignan', 'odeillo', 'cadarache', 'saclay', 'bourget', 'lille', 'nancy', 'rennes', 'rouen', 'grenoble-inp', 'cnrs', 'cea', 'ines', 'ifpen', 'edf', 'engie', 'cnr'];

    // ------------------------------------------------------------
    // 2. Strict Domain Relevance: Renewable Energy, Storage (BESS, STEP, Mechanical), Microgrid, PV, Thermal
    // ------------------------------------------------------------
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
      'mécanique des fluides',
      'microgrid',
      'smart grid',
      'réseau électrique',
      'reseau electrique',
      'intégration réseau',
      'gestion d\'énergie',
      'gestion d’énergie',
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
      'efficacite energetique',
      'décarbonation',
      'decarbonation',
      'ubem',
      'bâtiment',
      'matériaux batterie',
    ];

    // Explicitly reject unrelated fields (e.g. Pure nuclear reactor physics, non-energy metallurgy)
    const unrelatedTopicSignals = [
      'neutronique des réacteurs vver',
      'réacteur vver',
      'combustible uox',
      'physique des réacteurs vver',
    ];

    for (const item of items) {
      const titleLower = item.title.toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const locLower = (item.location || '').toLowerCase();
      const companyLower = (item.companyName || '').toLowerCase();
      const combined = `${titleLower} ${descLower} ${locLower} ${companyLower}`;

      // 1. Strict Exclusions: Tunisia & Germany
      const isExcludedCountry = excludedCountrySignals.some((sig) => {
        const regex = new RegExp(`\\b${sig}\\b`, 'i');
        return regex.test(locLower) || (locLower.includes(sig) && !locLower.includes('france'));
      });

      if (isExcludedCountry) {
        logger.info(`Rejected item "${item.title}" due to excluded location: ${item.location}`);
        rejectedCount++;
        continue;
      }

      // 2. Reject pure unrelated topics
      const isUnrelated = unrelatedTopicSignals.some((u) => combined.includes(u));
      if (isUnrelated) {
        logger.info(`Rejected item "${item.title}" due to unrelated domain (pure nuclear neutronics)`);
        rejectedCount++;
        continue;
      }

      // 3. Ensure target Energy & Storage domain match
      const hasTargetDomainMatch = targetEnergyDomainKeywords.some((kw) => combined.includes(kw));
      if (!hasTargetDomainMatch) {
        logger.info(`Rejected item "${item.title}" - does not match target Energy/Storage/PV/Microgrid focus`);
        rejectedCount++;
        continue;
      }

      // 4. Country Categorization (France Priority)
      const isFrance = franceSignals.some((sig) => locLower.includes(sig) || companyLower.includes(sig) || combined.includes(sig));
      if (isFrance) {
        item.country = 'France';
      } else {
        item.country = item.location || 'International';
      }

      // 5. Gratification
      item.stipendText = item.stipendText && item.stipendText !== 'Not disclosed' && item.stipendText !== 'Unspecified'
        ? item.stipendText
        : 'Gratification légale (France ~650€ - 1200€/mois)';
      if (!item.stipendMin) item.stipendMin = 650;
      if (!item.stipendMax) item.stipendMax = 1200;
      item.stipendCurrency = 'EUR';

      filtered.push(item);
    }

    logger.info(
      `EligibilityFilterStage: Filtered ${items.length} -> kept ${filtered.length} target PFE offers (Renewables, Storage, STEP, Microgrids, PV, Thermal), rejected ${rejectedCount}.`
    );

    return {
      filtered,
      rejectedCount,
    };
  }
}
