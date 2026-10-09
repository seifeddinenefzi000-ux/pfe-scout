import { CanonicalInternship, ResumeData } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export interface MatchEvaluationResult {
  score: number;
  skillMatchScore: number;
  projectMatchScore: number;
  educationMatchScore: number;
  explanation: string;
}

export class MatchingEngine {
  async evaluateMatch(
    internship: CanonicalInternship,
    resume: ResumeData
  ): Promise<MatchEvaluationResult> {
    // ------------------------------------------------------------
    // 1. RESUME VALIDATION
    // ------------------------------------------------------------
    if (!resume || !resume.isParsedSuccessfully) {
      const reason = resume?.parseErrorReason || 'Resume unavailable';
      logger.warn(`Resume matching skipped: ${reason}`);

      return {
        score: 0,
        skillMatchScore: 0,
        projectMatchScore: 0,
        educationMatchScore: 0,
        explanation: `Resume status: ${reason}`,
      };
    }

    // ------------------------------------------------------------
    // 2. DOMAIN & SKILL MATCHING (ENERGY ENGINEERING)
    // ------------------------------------------------------------
    const fullJobText = [
      internship.title,
      internship.companyName,
      internship.description,
      ...(internship.skills || []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Key energy concepts representing Seif's background
    const coreEnergyKeywords = [
      'énerg',
      'energ',
      'thermiq',
      'heat',
      'chaleur',
      'échangeur',
      'fluide',
      'mécaniq',
      'mechanic',
      'combustion',
      'pyrolyse',
      'solaire',
      'solar',
      'photovoltaïq',
      'pv',
      'éolien',
      'wind',
      'hydrogèn',
      'hydrogen',
      'bess',
      'batteri',
      'battery',
      'microgrid',
      'smart grid',
      'réseau',
      'grid',
      'électriq',
      'electric',
      'puissance',
      'power',
      'modélis',
      'model',
      'simulat',
      'matlab',
      'simulink',
      'python',
      'cfd',
      'ansys',
      'comsol',
      'fluent',
      'optimis',
      'efficacit',
      'decarbon',
      'audit',
      'industrie',
      'neutroni',
      'réacteur',
      'reactor',
      'nucléaire',
      'nuclear',
      'laser',
      'fabrication additive',
      'matériau',
      'stage',
      'master',
      'ingénieur',
      'chercheur',
    ];

    let matchedKeywordsCount = 0;
    const matchedKeywordTerms: string[] = [];

    for (const kw of coreEnergyKeywords) {
      if (fullJobText.includes(kw)) {
        matchedKeywordsCount++;
        matchedKeywordTerms.push(kw);
      }
    }

    // Direct resume skill matching
    const resumeSkills = (resume.skills || []).map((s) => s.toLowerCase().trim());
    let directSkillMatches = 0;

    for (const skill of resumeSkills) {
      if (fullJobText.includes(skill)) {
        directSkillMatches++;
      }
    }

    // Calculate skill match score
    // Base of 70 + bonus based on keyword and direct skill hits
    const skillMatchScore = Math.min(
      98,
      Math.max(
        60,
        Math.round(
          65 +
            Math.min(25, matchedKeywordsCount * 3.5) +
            Math.min(10, directSkillMatches * 2)
        )
      )
    );

    // ------------------------------------------------------------
    // 3. PROJECT MATCHING
    // ------------------------------------------------------------
    // Seif's projects: Solar Tracker, ENIM Energy Club Lead, SOTULUB Heat Exchanger optimization, CTKCP
    let projectMatchScore = 75;
    if (
      fullJobText.includes('solaire') ||
      fullJobText.includes('solar') ||
      fullJobText.includes('pv') ||
      fullJobText.includes('tracker')
    ) {
      projectMatchScore = 95;
    } else if (
      fullJobText.includes('thermiq') ||
      fullJobText.includes('chaleur') ||
      fullJobText.includes('échangeur') ||
      fullJobText.includes('four')
    ) {
      projectMatchScore = 92;
    } else if (
      fullJobText.includes('microgrid') ||
      fullJobText.includes('réseau') ||
      fullJobText.includes('grid') ||
      fullJobText.includes('batteri')
    ) {
      projectMatchScore = 90;
    } else if (
      fullJobText.includes('simulat') ||
      fullJobText.includes('modélis') ||
      fullJobText.includes('matlab') ||
      fullJobText.includes('python')
    ) {
      projectMatchScore = 88;
    }

    // ------------------------------------------------------------
    // 4. EDUCATION MATCHING
    // ------------------------------------------------------------
    // ENIM 3rd year Engineering + Master Recherche in Energy
    let educationMatchScore = 95;
    const isResearchOrMaster =
      fullJobText.includes('master') ||
      fullJobText.includes('ingénieur') ||
      fullJobText.includes('recherche') ||
      fullJobText.includes('pfe') ||
      fullJobText.includes('stage') ||
      fullJobText.includes('doctorant') ||
      fullJobText.includes('laboratoire');

    if (isResearchOrMaster) {
      educationMatchScore = 98;
    }

    // ------------------------------------------------------------
    // 5. PREMIER FRENCH LAB BONUS
    // ------------------------------------------------------------
    let labBonus = 0;
    const org = (internship.companyName || '').toUpperCase();
    if (
      org.includes('CEA') ||
      org.includes('CNRS') ||
      org.includes('PROMES') ||
      org.includes('INES') ||
      org.includes('IFPEN') ||
      org.includes('EDF') ||
      org.includes('ENGIE') ||
      org.includes('TOTAL')
    ) {
      labBonus = 5;
    }

    // ------------------------------------------------------------
    // 6. OVERALL MATCH SCORE
    // ------------------------------------------------------------
    const baseOverall = Math.round(
      skillMatchScore * 0.55 + projectMatchScore * 0.25 + educationMatchScore * 0.2
    );

    const overallMatchScore = Math.min(99, baseOverall + labBonus);

    // ------------------------------------------------------------
    // 7. EXPLANATION
    // ------------------------------------------------------------
    const explanation =
      `Energy Engineering Match: ${overallMatchScore}% | ` +
      `Skills: ${skillMatchScore}% (${matchedKeywordTerms.slice(0, 5).join(', ')}) | ` +
      `Academic Alignment: ENIM Diplôme Ingénieur + Master Recherche (${educationMatchScore}%).`;

    return {
      score: overallMatchScore,
      skillMatchScore,
      projectMatchScore,
      educationMatchScore,
      explanation,
    };
  }
}

export const matchingEngine = new MatchingEngine();
