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
      const resumeScore = item.resumeScore || 70;

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

      // 1. France Priority Bonus
      if (item.country === 'France' || (item.location && item.location.toLowerCase().includes('france'))) {
        overall += 25;
        reasons.push('🇫🇷 France Priority Target (+25)');
      } else if (item.country === 'Canada' || (item.location && item.location.toLowerCase().includes('canada'))) {
        overall += 15;
        reasons.push('🇨🇦 Canada Mitacs/Research Target (+15)');
      }

      // 2. Paid / Gratification Bonus
      if (item.stipendMin && item.stipendMin > 0) {
        overall += 10;
        reasons.push('💶 Paid/Gratified Opportunity (+10)');
      }

      // 3. Premier Research Organization Bonus
      const companyLower = item.companyName.toLowerCase();
      const isPremierEnergyOrg = [
        'cnrs',
        'cea',
        'promes',
        'laplace',
        'ifpen',
        'ines',
        'lemta',
        'g2elab',
        'lepmi',
        'coria',
        'edf',
        'engie',
        'totalenergies',
        'schneider',
        'rte',
        'mitacs',
      ].some(org => companyLower.includes(org));

      if (isPremierEnergyOrg) {
        overall += 15;
        reasons.push(`⭐ Premier Energy Lab/Company: ${item.companyName} (+15)`);
      }

      if (item.isRemote) {
        overall += 5;
        reasons.push('🏠 Flexible remote (+5)');
      }

      item.companyScore = companyScore;
      item.growthScore = growthScore;
      item.deadlineScore = deadlineScore;
      item.stipendScore = stipendScore;

      item.overallScore = Math.min(
        100,
        Math.round(overall)
      );

      item.matchExplanation = reasons.join(' | ');
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
    const companyLower = companyName.toLowerCase();

    const premierLabs = [
      'cnrs',
      'cea',
      'promes',
      'laplace',
      'ifpen',
      'ines',
      'lemta',
      'g2elab',
      'lepmi',
      'coria',
      'inria',
      'edf',
      'engie',
      'totalenergies',
      'schneider electric',
      'rte',
      'epfl',
      'eth zurich',
      'mitacs',
    ];

    if (premierLabs.some((org) => companyLower.includes(org))) {
      return 98;
    }

    return 75;
  }

  private computeGrowthScore(
    title: string,
    priorities: UserPriorities
  ): number {
    const targetEnergyDomains = [
      'renewable',
      'solar',
      'photovoltaic',
      'hydrogen',
      'fuel cell',
      'microgrid',
      'smart grid',
      'storage',
      'battery',
      'thermal',
      'thermique',
      'energy efficiency',
      'modelling',
      'simulation',
      'cfd',
      'pfe',
      'stage',
    ];

    const titleLower = title.toLowerCase();

    for (const domain of targetEnergyDomains) {
      if (titleLower.includes(domain)) {
        return 95;
      }
    }

    return 75;
  }

  private computeDeadlineScore(
    deadlineISO: string | null
  ): number {
    if (!deadlineISO) return 60;

    const diffDays =
      (new Date(deadlineISO).getTime() - Date.now()) / (1000 * 3600 * 24);

    if (diffDays < 0) return 0;
    if (diffDays <= 7) return 95;
    if (diffDays <= 30) return 85;

    return 70;
  }

  private computeStipendScore(
    min: number | null,
    max: number | null,
    currency: string,
    priorities: UserPriorities
  ): number {
    if (min || max) {
      const avg = ((min || 0) + (max || min || 0)) / 2;
      if (avg >= 1000) return 95;
      if (avg >= 600) return 85;
      return 70;
    }

    return 60;
  }
}

export const rankingEngine = new RankingEngine();