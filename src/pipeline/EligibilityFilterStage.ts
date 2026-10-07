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
    // Roles that are clearly senior/permanent positions
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
      'vice president engineering',
      'vp engineering',
    ];

    // ------------------------------------------------------------
    // Explicit internship / student / thesis indicators
    // ------------------------------------------------------------

    const internshipKeywords = [
      'intern',
      'internship',
      'internship opportunity',
      'trainee',
      'student',
      'student placement',
      'work placement',
      'industrial placement',
      'graduate internship',
      'research internship',
      'research intern',
      'thesis',
      'master thesis',
      'master thesis internship',
      'm2 internship',
      'pfe',
      'final year project',
      'graduation project',
      'capstone',
      'co-op',
      'coop',
      'alternance',
      'apprenticeship',
      'apprenti',
      'stage',
      'stage de fin d’études',
      'stage de fin d\'etudes',
      'stage pfe',
      'stage ingénieur',
      'stage ingenieur',
      'stage recherche',
    ];

    // ------------------------------------------------------------
    // Energy-related signals
    // ------------------------------------------------------------

    const energyKeywords = [
      'energy',
      'renewable',
      'solar',
      'photovoltaic',
      'pv system',
      'wind energy',
      'offshore wind',
      'onshore wind',
      'hydrogen',
      'fuel cell',
      'battery',
      'bess',
      'energy storage',
      'thermal storage',
      'thermal energy',
      'power system',
      'power electronics',
      'smart grid',
      'microgrid',
      'grid',
      'energy efficiency',
      'energy management',
      'energy system',
      'energy modelling',
      'energy modeling',
      'thermodynamic',
      'thermodynamics',
      'heat transfer',
      'thermal system',
      'cfd',
      'fluid mechanics',
      'fluid dynamics',
      'electrical engineering',
      'mechanical engineering',
      'process engineering',
      'sustainability',
      'decarbonization',
      'decarbonisation',
      'power-to-x',
      'power to x',
      'ptx',
      'carbon capture',
      'ccus',
    ];

    for (const item of items) {
      const titleLower = item.title.toLowerCase();

      const descriptionLower =
        (item.description || '').toLowerCase();

      const combinedText =
        `${titleLower} ${descriptionLower}`;

      // ----------------------------------------------------------
      // 1. Reject clearly senior permanent positions
      // ----------------------------------------------------------

      const isSenior = seniorKeywords.some(
        (keyword) =>
          titleLower.includes(keyword)
      );

      const hasInternshipSignal =
        internshipKeywords.some(
          (keyword) =>
            combinedText.includes(keyword)
        );

      if (isSenior && !hasInternshipSignal) {
        rejectedCount++;
        continue;
      }

      // ----------------------------------------------------------
      // 2. Reject obvious non-internship permanent positions
      // ----------------------------------------------------------

      const permanentSignals = [
        'full-time permanent',
        'full time permanent',
        'permanent position',
        'permanent employee',
        'indefinite contract',
        'cdi',
      ];

      const isPermanent =
        permanentSignals.some(
          (keyword) =>
            combinedText.includes(keyword)
        );

      if (isPermanent && !hasInternshipSignal) {
        rejectedCount++;
        continue;
      }

      // ----------------------------------------------------------
      // 3. Keep actual internships automatically
      // ----------------------------------------------------------

      if (hasInternshipSignal) {
        filtered.push(item);
        continue;
      }

      // ----------------------------------------------------------
      // 4. Keep energy research/project opportunities
      //
      // Some university/lab PFE offers don't explicitly say
      // "internship" in the title. For example:
      //
      // "Numerical modelling of thermal storage systems"
      //
      // Those should NOT be thrown away.
      // ----------------------------------------------------------

      const energyMatches =
        energyKeywords.filter(
          (keyword) =>
            combinedText.includes(keyword)
        ).length;

      const researchSignals = [
        'research',
        'laboratory',
        'lab',
        'university',
        'cnrs',
        'cea',
        'researcher',
        'phd',
        'thesis',
        'modelling',
        'modeling',
        'simulation',
        'experimental',
        'numerical',
      ];

      const hasResearchSignal =
        researchSignals.some(
          (keyword) =>
            combinedText.includes(keyword)
        );

      if (
        energyMatches >= 2 &&
        hasResearchSignal
      ) {
        filtered.push(item);
        continue;
      }

      // ----------------------------------------------------------
      // 5. Unknown role
      //
      // Don't aggressively reject it here.
      // Ranking/AI matching can decide later.
      // ----------------------------------------------------------

      filtered.push(item);
    }

    logger.info(
      `EligibilityFilterStage: Kept ${filtered.length} ` +
      `potentially eligible PFE/internship/research opportunities, ` +
      `rejected ${rejectedCount} clearly unsuitable roles.`
    );

    return {
      filtered,
      rejectedCount,
    };
  }
}
