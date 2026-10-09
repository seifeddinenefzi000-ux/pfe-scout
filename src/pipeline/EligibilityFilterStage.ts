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
    // Explicit Country Exclusions (per user strict rules)
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

    // Allowed / Prioritized target regions: France (Top Priority), Canada, US, UK, Europe (excl DE)
    const franceSignals = ['france', 'paris', 'toulouse', 'grenoble', 'lyon', 'bordeaux', 'marseille', 'montpellier', 'perpignan', 'odeillo', 'cadarache', 'saclay', 'grenoble-inp', 'cnrs', 'cea'];
    const otherAllowedSignals = ['canada', 'quebec', 'montreal', 'toronto', 'ottawa', 'vancouver', 'united states', 'usa', 'us', 'united kingdom', 'uk', 'london', 'switzerland', 'suisse', 'epfl', 'eth zurich', 'belgium', 'belgique', 'netherlands', 'pays-bas', 'spain', 'espagne', 'italy', 'italie', 'sweden', 'norway', 'denmark'];

    // ------------------------------------------------------------
    // Senior/permanent roles to reject
    // ------------------------------------------------------------
    const seniorKeywords = [
      'senior software engineer',
      'senior engineer',
      'staff engineer',
      'principal engineer',
      'lead engineer',
      'engineering manager',
      'technical manager',
      'engineering director',
      'director of engineering',
      'head of engineering',
      'vp engineering',
      'cdi',
      'permanent position',
      'full-time permanent',
    ];

    // ------------------------------------------------------------
    // Explicit internship / student / PFE thesis indicators
    // ------------------------------------------------------------
    const internshipKeywords = [
      'intern',
      'internship',
      'trainee',
      'student',
      'placement',
      'research intern',
      'thesis',
      'master thesis',
      'm2',
      'master 2',
      'pfe',
      'projet de fin d’études',
      'projet de fin d\'etudes',
      'stage',
      'stage de fin d’études',
      'stage de fin d\'etudes',
      'stage pfe',
      'stage ingénieur',
      'stage ingenieur',
      'stage recherche',
      'stage master',
      'alternance',
    ];

    // ------------------------------------------------------------
    // Energy Engineering domain keywords
    // ------------------------------------------------------------
    const energyKeywords = [
      'energy',
      'énergie',
      'energie',
      'renewable',
      'renouvelable',
      'solar',
      'solaire',
      'photovoltaic',
      'photovoltaïque',
      'pv',
      'wind',
      'éolien',
      'eolien',
      'hydrogen',
      'hydrogène',
      'fuel cell',
      'pile à combustible',
      'battery',
      'batterie',
      'storage',
      'stockage',
      'thermal',
      'thermique',
      'heat',
      'chaleur',
      'thermodynamique',
      'thermodynamic',
      'fluid',
      'mécanique des fluides',
      'cfd',
      'power system',
      'power electronics',
      'électronique de puissance',
      'microgrid',
      'smart grid',
      'grid',
      'réseau',
      'reseau',
      'efficiency',
      'efficacité énergétique',
      'efficacite energetique',
      'decarbonization',
      'décarbonation',
      'modelling',
      'modélisation',
      'simulation',
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

      // 2. Reject Senior/Permanent non-internship roles
      const isSeniorOrPermanent = seniorKeywords.some((k) => titleLower.includes(k) || descLower.includes(k));
      const hasInternshipSignal = internshipKeywords.some((k) => combined.includes(k));

      if (isSeniorOrPermanent && !hasInternshipSignal) {
        rejectedCount++;
        continue;
      }

      // 3. Energy Domain Relevance
      const energyMatches = energyKeywords.filter((k) => combined.includes(k)).length;
      if (energyMatches === 0 && !companyLower.includes('promes') && !companyLower.includes('laplace') && !companyLower.includes('cea')) {
        // Not relevant to Energy Engineering
        rejectedCount++;
        continue;
      }

      // 4. Country Categorization & Prioritization
      const isFrance = franceSignals.some((sig) => locLower.includes(sig) || companyLower.includes(sig));
      const isOtherAllowed = otherAllowedSignals.some((sig) => locLower.includes(sig) || combined.includes(sig));

      if (isFrance) {
        item.country = 'France';
      } else if (isOtherAllowed) {
        // Tag country
        if (locLower.includes('canada')) item.country = 'Canada';
        else if (locLower.includes('us') || locLower.includes('united states')) item.country = 'USA';
        else if (locLower.includes('uk') || locLower.includes('united kingdom')) item.country = 'UK';
        else item.country = item.location || 'Europe';
      } else {
        // If unspecified on a French lab site, default to France
        if (companyLower.includes('cnrs') || companyLower.includes('cea') || companyLower.includes('laplace') || companyLower.includes('promes')) {
          item.country = 'France';
        } else {
          item.country = 'International';
        }
      }

      // 5. Paid / Gratification Detection
      const paidSignals = [
        'gratifi',
        'rémunér',
        'remuner',
        'stipend',
        'paid',
        'salaire',
        'indemnit',
        'allocation',
        'bourses',
        'financement',
      ];
      const isExplicitlyPaid = paidSignals.some((k) => combined.includes(k));

      // In France, Master 2 / PFE internships (duration > 2 months) are legally mandated to be paid (~650€ - 1200€/month minimum gratification légale)
      if (isExplicitlyPaid || item.country === 'France') {
        item.stipendText = item.stipendText && item.stipendText !== 'Not disclosed' && item.stipendText !== 'Unspecified'
          ? item.stipendText
          : 'Gratification légale obligatoire (France ~4.35€/h)';
        if (!item.stipendMin) item.stipendMin = 650;
        if (!item.stipendMax) item.stipendMax = 1200;
        item.stipendCurrency = 'EUR';
      }

      filtered.push(item);
    }

    logger.info(
      `EligibilityFilterStage: Filtered ${items.length} -> kept ${filtered.length} eligible PFE offers, rejected ${rejectedCount} (excluded Tunisia/Germany/non-energy/senior).`
    );

    return {
      filtered,
      rejectedCount,
    };
  }
}
