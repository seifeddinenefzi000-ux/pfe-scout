import {
  CanonicalInternship,
  RankingWeights,
  UserPriorities,
} from '../models/DomainModels.js';

import { PreferenceRepository } from '../repositories/PreferenceRepository.js';
import { logger } from '../utils/logger.js';

export class RankingEngine {
  constructor(
    private prefRepo = new PreferenceRepository()
  ) {}

  async rankInternships(
    items: CanonicalInternship[]
  ): Promise<CanonicalInternship[]> {
    const weights: RankingWeights =
      await this.prefRepo.getRankingWeights();

    const priorities: UserPriorities =
      await this.prefRepo.getUserPriorities();

    for (const item of items) {
      const resumeScore = item.resumeScore || 60;

      const companyScore =
        this.computeCompanyScore(
          item.companyName,
          priorities
        );

      const growthScore =
        this.computeGrowthScore(
          item.title,
          priorities
        );

      const deadlineScore =
        this.computeDeadlineScore(item.deadline);

      const stipendScore =
        this.computeStipendScore(
          item.stipendMin,
          item.stipendMax,
          item.stipendCurrency,
          priorities
        );

      let overall =
        weights.resumeMatch * resumeScore +
        weights.companyPrestige * companyScore +
        weights.careerGrowth * growthScore +
        weights.deadlineUrgency * deadlineScore +
        weights.stipend * stipendScore;

      const reasons: string[] = [];

      reasons.push(
        `Resume match score: ${resumeScore}%`
      );

      /*
       * General research / government organization bonus.
       * This is no longer India-specific.
       */
      const companyLower =
        item.companyName.toLowerCase();

      const isResearchOrGovernment =
        companyLower.includes('cnrs') ||
        companyLower.includes('cea') ||
        companyLower.includes('ifpen') ||
        companyLower.includes('inria') ||
        companyLower.includes('fraunhofer') ||
        companyLower.includes('psi') ||
        companyLower.includes('epfl') ||
        companyLower.includes('vito') ||
        companyLower.includes('drdo') ||
        companyLower.includes('isro') ||
        companyLower.includes('csir') ||
        companyLower.includes('barc') ||
        companyLower.includes('government') ||
        companyLower.includes('govt');

      if (isResearchOrGovernment) {
        overall += 15;

        reasons.push(
          '⭐ Research / government organization bonus (+15)'
        );
      }

      /*
       * Remote flexibility bonus.
       * This is international and not tied to India.
       */
      if (item.isRemote) {
        overall += 10;

        reasons.push(
          '🏠 Flexible remote opportunity (+10)'
        );
      }

      if (companyScore >= 90) {
        reasons.push(
          `🏢 Premier organization: ${item.companyName}`
        );
      }

      item.companyScore = companyScore;
      item.growthScore = growthScore;
      item.deadlineScore = deadlineScore;
      item.stipendScore = stipendScore;

      item.overallScore = Math.min(
        100,
        Math.round(overall)
      );

      item.matchExplanation =
        reasons.join(' | ');

      item.status = 'RANKED';
    }

    return items.sort(
      (a, b) =>
        (b.overallScore || 0) -
        (a.overallScore || 0)
    );
  }

  private computeCompanyScore(
    companyName: string,
    priorities: UserPriorities
  ): number {
    const companyLower =
      companyName.toLowerCase();

    const prestigiousOrganizations = [
      'cnrs',
      'cea',
      'ifpen',
      'inria',
      'fraunhofer',
      'psi',
      'epfl',
      'vito',
      'drdo',
      'isro',
      'csir',
      'barc',
      'google',
      'microsoft',
      'amazon',
      'meta',
      'apple',
    ];

    if (
      prestigiousOrganizations.some(
        (organization) =>
          companyLower.includes(
            organization
          )
      )
    ) {
      return 95;
    }

    return 70;
  }

  private computeGrowthScore(
    title: string,
    priorities: UserPriorities
  ): number {
    const targetDomains =
      priorities.target_domains || [
        'AI/ML',
        'Backend',
        'Systems',
      ];

    const titleLower =
      title.toLowerCase();

    for (const domain of targetDomains) {
      if (
        titleLower.includes(
          domain.toLowerCase()
        )
      ) {
        return 90;
      }
    }

    return 75;
  }

  private computeDeadlineScore(
    deadlineISO: string | null
  ): number {
    if (!deadlineISO) return 50;

    const diffDays =
      (new Date(deadlineISO).getTime() -
        Date.now()) /
      (1000 * 3600 * 24);

    if (diffDays < 0) return 0;
    if (diffDays <= 3) return 95;
    if (diffDays <= 14) return 80;

    return 60;
  }

  private computeStipendScore(
    min: number | null,
    max: number | null,
    currency: string,
    priorities: UserPriorities
  ): number {
    if (!min && !max) return 50;

    /*
     * Until proper FX conversion is implemented,
     * only score stipend values when the currency is EUR.
     *
     * This prevents 35,000 INR from being treated like
     * 35,000 EUR.
     */
    if (currency !== 'EUR') {
      return 60;
    }

    const avg =
      ((min || 0) +
        (max || min || 0)) /
      2;

    if (avg >= 3500) return 95;
    if (avg >= 2500) return 80;
    if (avg >= 1500) return 65;

    return 40;
  }
}

export const rankingEngine =
  new RankingEngine();