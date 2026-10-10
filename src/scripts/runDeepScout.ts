import { ScheduledPipelineService } from '../deep_research/scheduled_pipeline.js';
import { logger } from '../utils/logger.js';

async function main() {
  const args = process.argv.slice(2);
  const notifyTelegram = !args.includes('--no-telegram');
  const maxQueries = args.includes('--quick') ? 2 : 4;

  console.log('===============================================================');
  console.log('🔬 PFE SCOUT — DEEP RESEARCH & AUTHENTIC DISCOVERY ENGINE');
  console.log('   Candidate: Seif Eddine Nefzi (ENIM Tunisia - Energy Eng.)');
  console.log('   Target Window: Jan - Feb 2027 (4-6 Months PFE)');
  console.log(`   Telegram Approval Dispatch: ${notifyTelegram ? 'ENABLED ✅' : 'DISABLED (dry-run) ⚠️'}`);
  console.log('===============================================================\n');

  try {
    const summary = await ScheduledPipelineService.runPipeline({
      maxQueries,
      maxResultsPerQuery: 3,
      enableCrawl: false,
      notifyTelegram,
      minScoreForApproval: 50,
    });

    console.log('\n===============================================================');
    console.log('📊 EXECUTION SUMMARY');
    console.log(`- URLs Discovered:      ${summary.discoveredUrlsCount}`);
    console.log(`- Documents Extracted:  ${summary.documentsProcessedCount}`);
    console.log(`- Offers Parsed:        ${summary.offersParsedCount}`);
    console.log(`- Eligible High-Ranked: ${summary.eligibleOffersCount}`);
    console.log(`- Telegram Cards Sent:  ${summary.telegramNotifiedCount}`);
    console.log(`- Duration:             ${Math.round(summary.executionDurationMs / 1000)}s`);
    console.log('===============================================================\n');

    if (summary.offers.length > 0) {
      console.log('Top Ranked Discovered Offers:');
      summary.offers.forEach((off, idx) => {
        const supInfo = off.supervisors[0]
          ? ` (Supervisor: ${off.supervisors[0].researcher.fullName})`
          : ' (Direct Portal / Official Web)';
        console.log(`  ${idx + 1}. [Score: ${off.score}] ${off.title} @ ${off.employer}${supInfo}`);
        console.log(`     Location: ${off.city || ''} ${off.country} | Mode: ${off.isDirectEmail ? 'Direct Email' : 'Career Portal'}`);
        console.log(`     Link: ${off.applicationUrl}\n`);
      });
    }

    process.exit(0);
  } catch (error) {
    logger.error('Deep Research Pipeline failed', { error: String(error) });
    console.error('❌ Pipeline run failed:', error);
    process.exit(1);
  }
}

main();
