import { initializePlugins } from '../plugins/initPlugins.js';
import { pluginRegistry } from '../plugins/PluginRegistry.js';

import { NormalizationStage } from '../pipeline/NormalizationStage.js';
import { DeduplicationStage } from '../pipeline/DeduplicationStage.js';
import { VerificationStage } from '../pipeline/VerificationStage.js';
import { CountryFilterStage } from '../pipeline/CountryFilterStage.js';
import { EligibilityFilterStage } from '../pipeline/EligibilityFilterStage.js';

import { matchingEngine } from '../services/MatchingEngine.js';
import { rankingEngine } from '../services/RankingEngine.js';
import { resumeParserService } from '../services/ResumeParserService.js';
import { enrichmentService } from '../services/EnrichmentService.js';

import { InternshipRepository } from '../repositories/InternshipRepository.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

async function main() {
  initializePlugins();

  console.log(
    '\n=================================================='
  );
  console.log(
    '🚀 PFE SCOUT — INTERNATIONAL VERIFIED PIPELINE'
  );
  console.log(
    '==================================================\n'
  );

  const startTime = Date.now();

  const repo =
    new InternshipRepository();

  /*
   * 1 & 2. Discovery and collection
   */
  logger.info(
    'Stage 1 & 2: Collecting real listings from registered plugins...'
  );

  const plugins =
    pluginRegistry.getAll();

  const rawListings = [];

  for (const plugin of plugins) {
    try {
      const page =
        await plugin.collect(plugin.id);

      const listings =
        await plugin.normalize(page);

      rawListings.push(...listings);
    } catch (error) {
      logger.warn(
        `Plugin failed during collection: ${plugin.id}`,
        {
          error: String(error),
        }
      );
    }
  }

  console.log(
    `🎉 Extracted ${rawListings.length} real raw internship(s)`
  );

  const canonicalListings =
    rawListings.map((raw) =>
      NormalizationStage.toCanonical(raw)
    );

  /*
   * 3. Deduplication
   */
  logger.info(
    'Stage 3: Deduplicating listings...'
  );

  const dedup =
    new DeduplicationStage();

  const {
    unique,
    duplicatesCount,
  } =
    await dedup.process(
      canonicalListings
    );

  console.log(
    `🧹 Filtered out ${duplicatesCount} duplicates. Unique items: ${unique.length}`
  );

  /*
   * 4. Verification
   */
  logger.info(
    'Stage 4: Verifying application URLs and data integrity...'
  );

  const verifier =
    new VerificationStage();

  const {
    verified: verifiedListings,
    rejected: rejectedVerification,
  } =
    verifier.verify(unique);

  console.log(
    `🛡️ Verified ${verifiedListings.length} real internships (Rejected ${rejectedVerification.length} invalid/unverifiable links)`
  );

  /*
   * 5. International filtering
   *
   * CountryFilterStage keeps international opportunities
   * and rejects opportunities clearly located in Tunisia.
   */
  logger.info(
    'Stage 5: Filtering international opportunities and excluding Tunisia...'
  );

  const countryFilter =
    new CountryFilterStage();

  const {
    filtered: internationalListings,
    rejectedCount: tunisiaRejected,
  } =
    countryFilter.process(
      verifiedListings
    );

  console.log(
    `🌍 Kept ${internationalListings.length} international internships (Rejected ${tunisiaRejected} Tunisia roles)`
  );

  /*
   * 6. Student eligibility
   */
  logger.info(
    'Stage 6: Filtering for student degree eligibility...'
  );

  const eligibilityFilter =
    new EligibilityFilterStage();

  const {
    filtered: eligibleListings,
  } =
    eligibilityFilter.process(
      internationalListings
    );

  console.log(
    `🎓 Eligible student opportunities: ${eligibleListings.length}`
  );

  /*
   * 7. Resume parsing and matching
   */
  logger.info(
    'Stage 7: Parsing resume and evaluating ATS match scores...'
  );

  const resume =
    await resumeParserService.parseResume(
      env.USER_RESUME_PATH
    );

  for (const item of eligibleListings) {
    try {
      const match =
        await matchingEngine.evaluateMatch(
          item,
          resume
        );

      item.resumeScore =
        match.score;

      item.skillMatchScore =
        match.skillMatchScore;

      item.projectMatchScore =
        match.projectMatchScore;

      item.educationMatchScore =
        match.educationMatchScore;

      item.matchExplanation =
        match.explanation;
    } catch (error) {
      logger.error(
        `Failed to match internship: ${item.title}`,
        {
          error: String(error),
        }
      );
    }
  }

  /*
   * 8. Multi-factor ranking
   */
  logger.info(
    'Stage 8: Ranking international energy engineering opportunities...'
  );

  const ranked =
    await rankingEngine.rankInternships(
      eligibleListings
    );

  if (ranked.length > 0) {
    console.log(
      `🏆 Top Recommendation: ${ranked[0]?.title} at ${ranked[0]?.companyName} (Score: ${ranked[0]?.overallScore}/100)`
    );
  }

  /*
   * 9. AI enrichment
   */
  logger.info(
    'Stage 9: Enriching top matches with Gemini AI...'
  );

  const enrichedListings = [];

  for (const item of ranked.slice(0, 10)) {
    try {
      const enriched =
        await enrichmentService.enrichInternship(
          item,
          resume
        );

      enrichedListings.push(
        enriched
      );
    } catch (error) {
      logger.warn(
        `Could not enrich internship: ${item.title}`,
        {
          error: String(error),
        }
      );
    }
  }

  /*
   * 10. Database persistence
   */
  logger.info(
    'Stage 10: Saving verified eligible internships to Supabase...'
  );

  const {
    savedCount,
  } =
    await repo.saveBatch(
      ranked
    );

  console.log(
    `💾 Saved ${savedCount} verified internships to Supabase.`
  );

  /*
   * 11. Telegram digest
   */
  logger.info(
    'Stage 11: Dispatching PFE Scout Telegram digest...'
  );

  const digestSent =
    await telegramNotifier.sendDailyDigest(
      rawListings.length,
      eligibleListings.length,
      ranked
    );

  const duration =
    (
      (Date.now() - startTime) /
      1000
    ).toFixed(1);

  /*
   * Final summary
   */
  console.log(
    '\n=================================================='
  );

  console.log(
    '📊 PFE SCOUT INTERNATIONAL PIPELINE SUMMARY'
  );

  console.log(
    '=================================================='
  );

  console.log(
    `  Discovered Listings: ${rawListings.length}`
  );

  console.log(
    `  Verified Listings:   ${verifiedListings.length}`
  );

  console.log(
    `  International Kept:  ${internationalListings.length}`
  );

  console.log(
    `  Tunisia Rejected:    ${tunisiaRejected}`
  );

  console.log(
    `  Eligible Student:    ${eligibleListings.length}`
  );

  console.log(
    `  Saved to Supabase:   ${savedCount}`
  );

  console.log(
    `  Telegram Digest Sent:${digestSent ? ' YES ✅' : ' NO ❌'}`
  );

  console.log(
    `  Total Duration:      ${duration}s`
  );

  console.log(
    '==================================================\n'
  );
}

main().catch((err) => {
  console.error(
    'Fatal Pipeline Execution Error:',
    err
  );
});