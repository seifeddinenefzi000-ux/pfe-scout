import { SearchDiscoveryService } from './search_discovery.js';
import { SafeHttpFetcherService } from './http_fetcher.js';
import { HtmlExtractorService } from './html_extractor.js';
import { PdfExtractorService } from './pdf_extractor.js';
import { OcrFallbackService } from './ocr_fallback.js';
import { LinkCrawlerService } from './link_crawler.js';
import { OfferParserService } from './offer_parser.js';
import { OfferDeduplicatorService } from './offer_deduplicator.js';
import { SupervisorResolverService } from './supervisor_resolver.js';
import { EmailFinderService } from './email_finder.js';
import { EmailVerifierService } from './email_verifier.js';
import { EligibilityRankerService } from './eligibility_ranker.js';
import { SupabaseWriterService } from './supabase_writer.js';
import { AuditLoggerService } from './audit_logger.js';
import {
  ParsedInternshipOffer,
  SourceDocument,
  OfferResearcherLink,
  ResearcherEmailRecord,
} from './types.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { telegramNotifier } from '../notifications/TelegramNotifier.js';
import { applicationTailoringService, ApplicationDraft } from '../services/ApplicationTailoringService.js';
import { logger } from '../utils/logger.js';
import { task, schedules } from '@trigger.dev/sdk';

export interface PipelineExecutionOptions {
  queries?: string[];
  maxQueries?: number;
  maxResultsPerQuery?: number;
  enableCrawl?: boolean;
  notifyTelegram?: boolean;
  minScoreForApproval?: number;
}

export interface PipelineExecutionSummary {
  discoveredUrlsCount: number;
  documentsProcessedCount: number;
  offersParsedCount: number;
  eligibleOffersCount: number;
  telegramNotifiedCount: number;
  executionDurationMs: number;
  offers: ParsedInternshipOffer[];
}

export class ScheduledPipelineService {
  /**
   * Execute the end-to-end Deep Research Engine pipeline
   */
  public static async runPipeline(
    options?: PipelineExecutionOptions
  ): Promise<PipelineExecutionSummary> {
    const startTime = Date.now();
    logger.info('🚀 [Deep Research Engine] Launching autonomous research pipeline...');

    // 1. Search Discovery
    const discoveryQueries = options?.queries ?? SearchDiscoveryService.DEFAULT_QUERIES.slice(0, options?.maxQueries ?? 4);
    logger.info(`🔍 [Deep Research] Discovering authentic opportunities across ${discoveryQueries.length} queries...`);
    const discoveredResults = await SearchDiscoveryService.discoverOffers({
      queries: discoveryQueries,
      maxResultsPerQuery: options?.maxResultsPerQuery ?? 5,
    });
    logger.info(`✓ Discovered ${discoveredResults.length} raw source URLs.`);

    // 2. Fetching & Document Extraction
    const rawOffers: ParsedInternshipOffer[] = [];
    const processedDocuments: SourceDocument[] = [];
    const seenUrls = new Set<string>();

    for (const item of discoveredResults) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      const fetchRes = await SafeHttpFetcherService.fetch(item.url);
      if (!fetchRes.ok || !fetchRes.data) continue;

      const isPdf =
        fetchRes.contentType.toLowerCase().includes('application/pdf') ||
        item.url.toLowerCase().endsWith('.pdf');

      let text = '';
      let pageCount = 1;
      let titleHint = item.titleSnippet;
      let outgoingLinks: string[] = [];

      if (isPdf) {
        try {
          const pdfBuffer = Buffer.isBuffer(fetchRes.data)
            ? fetchRes.data
            : Buffer.from(fetchRes.data);
          const pdfRes = await PdfExtractorService.extractPdf(pdfBuffer, { sourceUrl: item.url });
          text = pdfRes.fullText;
          pageCount = pdfRes.totalPages;
          titleHint = pdfRes.metadata.title || titleHint;
          outgoingLinks = pdfRes.allLinks;

          // OCR Fallback if scanned
          if (pdfRes.needsOcrFallback && pdfRes.pagesNeedingOcr.length > 0) {
            const ocrResults = await OcrFallbackService.ocrPdfPages(
              pdfBuffer,
              pdfRes.pagesNeedingOcr,
              item.url
            );
            for (const ocrPage of ocrResults) {
              if (ocrPage.text) {
                text += `\n\n--- OCR PAGE ${ocrPage.pageNumber} ---\n${ocrPage.text}`;
              }
            }
          }
        } catch (pdfErr) {
          logger.warn(`Could not extract PDF ${item.url}: ${String(pdfErr)}`);
          continue;
        }
      } else {
        const htmlStr = typeof fetchRes.data === 'string'
          ? fetchRes.data
          : Buffer.from(fetchRes.data).toString('utf-8');
        const htmlRes = HtmlExtractorService.extract(htmlStr, item.url);
        text = htmlRes.cleanText;
        titleHint = htmlRes.title || titleHint;
        outgoingLinks = htmlRes.outgoingLinks;
      }

      if (!text || text.length < 50) continue;

      const docRecord: SourceDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        url: item.url,
        canonicalUrl: item.url,
        contentType: fetchRes.contentType,
        httpStatus: fetchRes.status,
        contentHash: fetchRes.contentHash,
        retrievedAt: new Date().toISOString(),
        extractionStatus: 'EXTRACTED',
        isPdf,
        requiresJs: false,
        text,
        pageCount,
        evidenceMetadata: { query: item.query, adapter: item.sourceAdapter },
      };
      processedDocuments.push(docRecord);
      await SupabaseWriterService.saveSourceDocument(docRecord);

      // 3. Deterministic Offer Parsing
      const parsedOffer = OfferParserService.parseOffer({
        url: item.url,
        text,
        titleHint,
        isPdf,
        pageCount,
      });

      // 4. Candidate Emails & Supervisor Resolution
      const candidateEmails = EmailFinderService.extractEmails(text);
      const supervisors = SupervisorResolverService.resolveSupervisors(
        text,
        item.url,
        true,
        candidateEmails
      );
      parsedOffer.supervisors = supervisors;

      // 5. Optional Bounded Link Crawl for lab/team pages
      if (options?.enableCrawl && outgoingLinks.length > 0) {
        try {
          const crawled = await LinkCrawlerService.crawl(outgoingLinks.slice(0, 3), {
            maxDepth: 2,
            maxPagesPerDomain: 3,
            maxTotalPages: 5,
          });

          for (const [cUrl, cRes] of crawled.entries()) {
            if (cRes.rawText) {
              const crawledEmails = EmailFinderService.extractEmails(cRes.rawText);
              const crawledSupervisors = SupervisorResolverService.resolveSupervisors(
                cRes.rawText,
                cUrl,
                true,
                crawledEmails
              );
              // Merge if new supervisor found
              for (const cs of crawledSupervisors) {
                if (!parsedOffer.supervisors.some((s: OfferResearcherLink) => s.researcher.cleanName === cs.researcher.cleanName)) {
                  parsedOffer.supervisors.push(cs);
                }
              }
            }
          }
        } catch (crawlErr) {
          logger.warn(`Crawler warning for ${item.url}: ${String(crawlErr)}`);
        }
      }

      rawOffers.push(parsedOffer);
    }

    // 6. Deduplication
    logger.info(`📋 Deduplicating ${rawOffers.length} parsed offers...`);
    const deduplicatedOffers = OfferDeduplicatorService.deduplicate(rawOffers);
    logger.info(`✓ Deduplicated to ${deduplicatedOffers.length} unique offers.`);

    // 7. Deterministic Eligibility Ranking & Scoring
    const minScore = options?.minScoreForApproval ?? 60;
    const eligibleOffers: ParsedInternshipOffer[] = [];

    for (const offer of deduplicatedOffers) {
      const { score, eligibility } = EligibilityRankerService.rankOffer(offer);
      await SupabaseWriterService.saveInternshipOffer(offer);

      if (eligibility === 'ELIGIBLE' && score >= minScore) {
        eligibleOffers.push(offer);
      }
    }
    logger.info(`🎯 Identified ${eligibleOffers.length} strictly eligible high-scoring offers.`);

    // 8. Human Review / Telegram Approval Dispatch
    let telegramCount = 0;
    if (options?.notifyTelegram !== false && eligibleOffers.length > 0) {
      for (const offer of eligibleOffers) {
        try {
          const directSupervisor = offer.supervisors.find((s: OfferResearcherLink) =>
            s.researcher.emails.some((e: ResearcherEmailRecord) => EmailVerifierService.isAcceptableSupervisorEmail(e.status))
          );
          const directEmail = directSupervisor?.researcher.emails.find((e: ResearcherEmailRecord) =>
            EmailVerifierService.isAcceptableSupervisorEmail(e.status)
          )?.address;

          const isDirectEmail = Boolean(directEmail && directSupervisor);
          let tailored: ApplicationDraft;

          if (isDirectEmail && directSupervisor && directEmail) {
            tailored = await applicationTailoringService.tailorForSupervisor({
              name: directSupervisor.researcher.fullName,
              email: directEmail,
              institution: offer.employer,
              country: offer.country,
              recentPublication: offer.title,
              searchTopic: offer.technicalDomain,
              relevanceScore: offer.score,
            });
          } else {
            const canonicalOffer: CanonicalInternship = {
              id: offer.id,
              sourceId: 'deep_research',
              title: offer.title,
              companyName: offer.employer,
              location: offer.city ? `${offer.city}, ${offer.country}` : offer.country,
              country: offer.country,
              isRemote: false,
              description: offer.description,
              applyUrl: offer.applicationUrl,
              canonicalUrl: offer.applicationUrl,
              contentHash: offer.id,
              status: 'RANKED',
              skills: offer.skills,
              deadline: offer.deadline || null,
              metadata: { durationMonths: offer.durationMonths },
              stipendMin: offer.stipendAmount || null,
              stipendMax: offer.stipendAmount || null,
              stipendCurrency: offer.stipendCurrency || 'EUR',
              stipendText: offer.stipendAmount ? `${offer.stipendAmount} €/mois` : 'Gratification légale',
              matchExplanation: `Focus: ${offer.technicalDomain} (${offer.skills.join(', ')})`,
              overallScore: offer.score,
            };
            tailored = await applicationTailoringService.tailorForPostedOffer(canonicalOffer);
          }

          const sent = await telegramNotifier.sendApplicationApprovalCard(tailored);
          if (sent) telegramCount++;
          await new Promise(r => setTimeout(r, 600)); // maintain Telegram rate limit
        } catch (cardErr) {
          logger.error(`Error sending approval card for offer ${offer.id}: ${String(cardErr)}`);
        }
      }
    }

    // 9. Flush Structured Audit Logs to Supabase
    await SupabaseWriterService.savePipelineLogs(AuditLoggerService.getBuffer());

    const duration = Date.now() - startTime;
    logger.info(`✨ Deep Research Pipeline completed in ${Math.round(duration / 1000)}s.`);

    return {
      discoveredUrlsCount: discoveredResults.length,
      documentsProcessedCount: processedDocuments.length,
      offersParsedCount: rawOffers.length,
      eligibleOffersCount: eligibleOffers.length,
      telegramNotifiedCount: telegramCount,
      executionDurationMs: duration,
      offers: eligibleOffers,
    };
  }
}

/**
 * Trigger.dev Scheduled Task for Deep Research Engine
 */
export const deepResearchScheduledTask = schedules.task({
  id: 'deep-research-scheduled-task',
  cron: '0 8 * * *',
  run: async () => {
    return await ScheduledPipelineService.runPipeline({ notifyTelegram: true });
  },
});

/**
 * Trigger.dev On-Demand Task
 */
export const deepResearchOnDemandTask = task({
  id: 'deep-research-ondemand-task',
  run: async (payload: PipelineExecutionOptions) => {
    return await ScheduledPipelineService.runPipeline(payload);
  },
});
