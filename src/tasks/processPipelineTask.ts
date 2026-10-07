import { task } from '@trigger.dev/sdk/v3';

import { NormalizationStage } from '../pipeline/NormalizationStage.js';
import { DeduplicationStage } from '../pipeline/DeduplicationStage.js';
import { VerificationStage } from '../pipeline/VerificationStage.js';
import { EligibilityFilterStage } from '../pipeline/EligibilityFilterStage.js';

import { matchingEngine } from '../services/MatchingEngine.js';
import { rankingEngine } from '../services/RankingEngine.js';
import { resumeParserService } from '../services/ResumeParserService.js';
import { enrichmentService } from '../services/EnrichmentService.js';

import { InternshipRepository } from '../repositories/InternshipRepository.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';

import { RawInternship } from '../models/DomainModels.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const processPipelineTask = task({
  id: 'process-pipeline',

  run: async (payload: {
    rawItems: RawInternship[];
    sourceId?: string;
  }) => {
    logger.info(
      `Starting PFE Scout international internship pipeline for ${payload.rawItems.length} raw items`
    );

    // ------------------------------------------------------------
    // 1. NORMALIZATION
    // ------------------------------------------------------------

    const canonicalItems = payload.rawItems.map((raw) =>
      NormalizationStage.toCanonical(raw, payload.sourceId)
    );

    logger.info(`Normalized ${canonicalItems.length} internships.`);


    // ------------------------------------------------------------
    // 2. DEDUPLICATION
    // ------------------------------------------------------------

    const dedup = new DeduplicationStage();

    const { unique } = await dedup.process(canonicalItems);

    logger.info(`After deduplication: ${unique.length} internships.`);


    // ------------------------------------------------------------
    // 3. VERIFICATION
    // ------------------------------------------------------------

    const verifier = new VerificationStage();

    const { verified } = verifier.verify(unique);

    logger.info(`Verified ${verified.length} internships.`);


    // ------------------------------------------------------------
    // 4. INTERNATIONAL ELIGIBILITY FILTER
    // ------------------------------------------------------------

    const eligibilityFilter = new EligibilityFilterStage();

    const { filtered: eligibleItems } =
      eligibilityFilter.process(verified);

    logger.info(
      `International eligibility filter kept ${eligibleItems.length} internships.`
    );


    // ------------------------------------------------------------
    // 5. RESUME PARSING
    // ------------------------------------------------------------

    const resume = await resumeParserService.parseResume(
      env.USER_RESUME_PATH
    );


    // ------------------------------------------------------------
    // 6. MATCH EACH INTERNSHIP TO USER PROFILE
    // ------------------------------------------------------------

    for (const item of eligibleItems) {
      try {
        const match = await matchingEngine.evaluateMatch(
          item,
          resume
        );

        item.resumeScore = match.score;
        item.skillMatchScore = match.skillMatchScore;
        item.projectMatchScore = match.projectMatchScore;
        item.educationMatchScore = match.educationMatchScore;
        item.matchExplanation = match.explanation;

      } catch (error) {
        logger.error(
          `Failed to match internship "${item.title}"`,
          {
            error: String(error),
          }
        );
      }
    }


    // ------------------------------------------------------------
    // 7. RANK
    // ------------------------------------------------------------

    const ranked = await rankingEngine.rankInternships(
      eligibleItems
    );

    logger.info(
      `Ranking completed. ${ranked.length} internships ranked.`
    );


    // ------------------------------------------------------------
    // 8. ENRICH TOP RESULTS
    // ------------------------------------------------------------

    const enrichedListings = [];

    for (const item of ranked.slice(0, 10)) {
      try {
        const enriched =
          await enrichmentService.enrichInternship(
            item,
            resume
          );

        enrichedListings.push(enriched);

      } catch (error) {
        logger.warn(
          `Could not enrich internship "${item.title}"`,
          {
            error: String(error),
          }
        );
      }
    }


    // ------------------------------------------------------------
    // 9. SAVE TO DATABASE
    // ------------------------------------------------------------

    const internshipRepo =
      new InternshipRepository();

    const { savedCount } =
      await internshipRepo.saveBatch(ranked);


    // ------------------------------------------------------------
    // 10. TELEGRAM DIGEST
    // ------------------------------------------------------------

    await telegramNotifier.sendDailyDigest(
      payload.rawItems.length,
      eligibleItems.length,
      ranked
    );


    // ------------------------------------------------------------
    // 11. RESULT
    // ------------------------------------------------------------

    return {
      processedCount: payload.rawItems.length,

      normalizedCount: canonicalItems.length,

      deduplicatedCount: unique.length,

      verifiedCount: verified.length,

      eligibleInternationalCount:
        eligibleItems.length,

      savedCount,

      enrichedCount:
        enrichedListings.length,

      topRankedTitle:
        ranked[0]?.title,

      topRankedCompany:
        ranked[0]?.companyName,

      topRankedCountry:
        ranked[0]?.country,
    };
  },
});
