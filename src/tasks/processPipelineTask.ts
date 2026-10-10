import { task } from '@trigger.dev/sdk';

import { NormalizationStage } from '../pipeline/NormalizationStage.js';
import { DeduplicationStage } from '../pipeline/DeduplicationStage.js';
import { VerificationStage } from '../pipeline/VerificationStage.js';
import { EligibilityFilterStage } from '../pipeline/EligibilityFilterStage.js';

import { matchingEngine } from '../services/MatchingEngine.js';
import { rankingEngine } from '../services/RankingEngine.js';
import { resumeParserService } from '../services/ResumeParserService.js';
import { enrichmentService } from '../services/EnrichmentService.js';
import { applicationTailoringService, ApplicationDraft } from '../services/ApplicationTailoringService.js';
import { supervisorScoutService } from '../services/SupervisorScoutService.js';
import { archiveService } from '../services/ArchiveService.js';

import { InternshipRepository } from '../repositories/InternshipRepository.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';

import { RawInternship } from '../models/DomainModels.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface ProcessPipelinePayload {
  rawItems: RawInternship[];
  sourceId?: string;
  runSupervisorOutreach?: boolean;
}

export async function runProcessPipeline(payload: ProcessPipelinePayload) {
  if (!payload || !Array.isArray(payload.rawItems)) {
    throw new Error(
      'Invalid process-pipeline payload: rawItems must be an array.'
    );
  }

  logger.info(
    `Starting PFE Scout international pipeline for ${payload.rawItems.length} raw items (France Prioritized, TN/DE excluded)`,
    {
      sourceId: payload.sourceId,
    }
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
    // 4. ELIGIBILITY FILTER (Strict Tunisia/Germany Exclusions & Energy Domain)
    // ------------------------------------------------------------
    const eligibilityFilter = new EligibilityFilterStage();
    const { filtered: eligibleItems } = eligibilityFilter.process(verified);
    logger.info(
      `Eligibility filter kept ${eligibleItems.length} internships.`
    );

    // ------------------------------------------------------------
    // 5. RESUME PARSING
    // ------------------------------------------------------------
    let resume = await resumeParserService.parseResume(env.USER_RESUME_PATH);

    // ------------------------------------------------------------
    // 6. MATCH EACH INTERNSHIP TO USER PROFILE
    // ------------------------------------------------------------
    for (const item of eligibleItems) {
      try {
        const match = await matchingEngine.evaluateMatch(item, resume);
        item.resumeScore = match.score;
        item.skillMatchScore = match.skillMatchScore;
        item.projectMatchScore = match.projectMatchScore;
        item.educationMatchScore = match.educationMatchScore;
        item.matchExplanation = match.explanation;
      } catch (error) {
        logger.error(`Failed to match internship "${item.title}"`, { error: String(error) });
      }
    }

    // ------------------------------------------------------------
    // 7. RANK (France Priority, Gratification detection & Premier Energy Labs)
    // ------------------------------------------------------------
    const ranked = await rankingEngine.rankInternships(eligibleItems);
    logger.info(`Ranking completed. ${ranked.length} internships ranked.`);

    // ------------------------------------------------------------
    // 8. ENRICH TOP RESULTS
    // ------------------------------------------------------------
    const enrichedListings = [];
    for (const item of ranked.slice(0, 10)) {
      try {
        const enriched = await enrichmentService.enrichInternship(item, resume);
        enrichedListings.push(enriched);
      } catch (error) {
        logger.warn(`Could not enrich internship "${item.title}"`, { error: String(error) });
      }
    }

    // ------------------------------------------------------------
    // 9. SAVE TO DATABASE (Supabase)
    // ------------------------------------------------------------
    const internshipRepo = new InternshipRepository();
    const { savedCount } = await internshipRepo.saveBatch(ranked);
    logger.info(`Saved ${savedCount} internships to Supabase.`);

    // ------------------------------------------------------------
    // 10. APPLICATION PIPELINE & TELEGRAM APPROVAL GATE (~30 Daily Target)
    // ------------------------------------------------------------
    // A. Posted Offers (~10 Target): tailor CV & cover letter and send approval cards
    const topPostedOffers = ranked.slice(0, 10);
    const postedDrafts: ApplicationDraft[] = [];

    for (const offer of topPostedOffers) {
      try {
        const draft = await applicationTailoringService.tailorForPostedOffer(offer);
        postedDrafts.push(draft);
        await telegramNotifier.sendApplicationApprovalCard(draft);
      } catch (err) {
        logger.warn(`Failed preparing application for "${offer.title}"`, { error: String(err) });
      }
    }

    // B. Supervisor Cold Outreach (~20 Target)
    let supervisorDrafts: ApplicationDraft[] = [];
    if (payload.runSupervisorOutreach !== false) {
      try {
        supervisorDrafts = await supervisorScoutService.getDailySupervisorBatch(20);
        for (const draft of supervisorDrafts.slice(0, 5)) {
          // Send top 5 initial cards to avoid spamming rate limit in one burst
          await telegramNotifier.sendApplicationApprovalCard(draft);
        }
      } catch (err) {
        logger.warn('Failed generating supervisor cold outreach batch', { error: String(err) });
      }
    }

    // C. Daily Digest & Batch Summary
    await telegramNotifier.sendDailyDigest(
      payload.rawItems.length,
      eligibleItems.length,
      ranked
    );

    await telegramNotifier.sendDailyBatchSummary(
      postedDrafts.length,
      supervisorDrafts.length
    );

    // D. Move processed opportunities to the permanent closed archive folder
    if (eligibleItems.length > 0) {
      await archiveService.archiveOffers(eligibleItems);
    }

    // ------------------------------------------------------------
    // 11. RESULT
    // ------------------------------------------------------------
    return {
      processedCount: payload.rawItems.length,
      normalizedCount: canonicalItems.length,
      deduplicatedCount: unique.length,
      verifiedCount: verified.length,
      eligibleInternationalCount: eligibleItems.length,
      savedCount,
      enrichedCount: enrichedListings.length,
      postedApplicationsPrepared: postedDrafts.length,
      supervisorApplicationsPrepared: supervisorDrafts.length,
      topRankedTitle: ranked[0]?.title ?? null,
      topRankedCompany: ranked[0]?.companyName ?? null,
      topRankedCountry: ranked[0]?.country ?? null,
    };
}

export const processPipelineTask = task({
  id: 'process-pipeline',
  run: async (payload: ProcessPipelinePayload) => {
    return await runProcessPipeline(payload);
  },
});

