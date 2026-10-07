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
      const reason =
        resume?.parseErrorReason ||
        'Resume unavailable';

      logger.warn(
        `Resume matching skipped: ${reason}`
      );

      return {
        score: 0,
        skillMatchScore: 0,
        projectMatchScore: 0,
        educationMatchScore: 0,
        explanation: `Resume status: ${reason}`,
      };
    }


    // ------------------------------------------------------------
    // 2. SKILL MATCHING
    // ------------------------------------------------------------

    const resumeSkills = new Set(
      resume.skills.map((skill) =>
        skill.toLowerCase().trim()
      )
    );

    const jobSkills = internship.skills.map((skill) =>
      skill.toLowerCase().trim()
    );

    let matchedSkillsCount = 0;

    if (jobSkills.length > 0) {

      for (const skill of jobSkills) {
        if (resumeSkills.has(skill)) {
          matchedSkillsCount++;
        }
      }

    } else {

      const description =
        internship.description.toLowerCase();

      for (const skill of resumeSkills) {
        if (description.includes(skill)) {
          matchedSkillsCount++;
        }
      }
    }


    const skillMatchScore = Math.min(
      100,
      Math.round(
        (
          matchedSkillsCount /
          Math.max(1, jobSkills.length || 5)
        ) * 100
      )
    );


    // ------------------------------------------------------------
    // 3. PROJECT MATCHING
    // ------------------------------------------------------------

    let projectMatchScore = 50;

    if (resume.projects.length > 0) {

      const projectTechnologies =
        new Set(
          resume.projects.flatMap(
            (project) =>
              project.technologies.map(
                (technology) =>
                  technology.toLowerCase().trim()
              )
          )
        );

      let matchedProjectTechnologies = 0;

      for (const skill of jobSkills) {
        if (projectTechnologies.has(skill)) {
          matchedProjectTechnologies++;
        }
      }

      if (jobSkills.length > 0) {

        projectMatchScore = Math.min(
          100,
          Math.round(
            (
              matchedProjectTechnologies /
              jobSkills.length
            ) * 100
          )
        );

      } else {

        projectMatchScore = 60;
      }
    }


    // ------------------------------------------------------------
    // 4. EDUCATION MATCHING
    // ------------------------------------------------------------

    /*
     * IMPORTANT:
     *
     * This replaces the original India-specific logic:
     *
     *   IIT
     *   Tier-1
     *   B.E.
     *
     * PFE Scout is now international.
     */

    let educationMatchScore = 70;

    if (resume.education.length > 0) {

      const educationText =
        resume.education
          .map((education) =>
            [
              education.degree,
              education.fieldOfStudy,
              education.institution,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
          )
          .join(' ');

      const energyKeywords = [
        'energy',
        'energetic',
        'renewable',
        'electrical',
        'mechanical',
        'thermal',
        'thermodynamic',
        'power',
        'engineering',
        'physics',
        'environment',
        'sustainability',
      ];

      const matchedEducationKeywords =
        energyKeywords.filter((keyword) =>
          educationText.includes(keyword)
        ).length;

      if (matchedEducationKeywords >= 3) {
        educationMatchScore = 95;
      } else if (matchedEducationKeywords >= 2) {
        educationMatchScore = 90;
      } else if (matchedEducationKeywords >= 1) {
        educationMatchScore = 85;
      } else {
        educationMatchScore = 70;
      }
    }


    // ------------------------------------------------------------
    // 5. OVERALL MATCH SCORE
    // ------------------------------------------------------------

    const overallMatchScore =
      Math.round(
        skillMatchScore * 0.60 +
        projectMatchScore * 0.25 +
        educationMatchScore * 0.15
      );


    // ------------------------------------------------------------
    // 6. EXPLANATION
    // ------------------------------------------------------------

    const explanation =
      `Skill Match: ${skillMatchScore}% ` +
      `(${matchedSkillsCount} skills matched) | ` +
      `Project Match: ${projectMatchScore}% | ` +
      `Education Match: ${educationMatchScore}%.`;


    return {
      score: overallMatchScore,
      skillMatchScore,
      projectMatchScore,
      educationMatchScore,
      explanation,
    };
  }
}

export const matchingEngine =
  new MatchingEngine();
