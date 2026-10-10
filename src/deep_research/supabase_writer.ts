import * as fs from 'fs';
import * as path from 'path';
import { getSupabaseClient } from '../database/client.js';
import {
  ParsedInternshipOffer,
  PipelineAuditLog,
  ReviewQueueItem,
  SearchRunRecord,
  SourceDocument,
} from './types.js';
import { AuditLoggerService } from './audit_logger.js';

export class SupabaseWriterService {
  private static localDataDir = path.resolve(process.cwd(), 'data', 'deep_research');

  private static ensureLocalDir(): void {
    if (!fs.existsSync(this.localDataDir)) {
      fs.mkdirSync(this.localDataDir, { recursive: true });
    }
  }

  private static appendLocalFile(filename: string, record: unknown): void {
    try {
      this.ensureLocalDir();
      const filePath = path.join(this.localDataDir, filename);
      let records: unknown[] = [];
      if (fs.existsSync(filePath)) {
        try {
          records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {
          records = [];
        }
      }
      records.push(record);
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err) {
      // Local fallback write error should never crash process
    }
  }

  /**
   * Persist a search run record
   */
  public static async saveSearchRun(run: SearchRunRecord): Promise<void> {
    this.appendLocalFile('search_runs.json', run);

    try {
      const supabase = getSupabaseClient();
      await supabase.from('search_runs').upsert({
        id: run.id,
        query: run.query,
        source_adapter: run.sourceAdapter,
        started_at: run.startedAt,
        finished_at: run.finishedAt || new Date().toISOString(),
        status: run.status,
        results_count: run.resultsCount,
        http_status: run.httpStatus,
        pagination_info: run.paginationInfo,
        error_details: run.errorDetails,
        retry_count: run.retryCount,
      });
    } catch (err) {
      AuditLoggerService.log({
        taskName: 'supabase_writer',
        operation: 'saveSearchRun',
        status: 'WARN',
        error: `Supabase write failed, buffered locally: ${String(err)}`,
        retryCount: 0,
        durationMs: 0,
      });
    }
  }

  /**
   * Persist a source document
   */
  public static async saveSourceDocument(doc: SourceDocument): Promise<void> {
    this.appendLocalFile('source_documents.json', {
      id: doc.id,
      url: doc.url,
      canonicalUrl: doc.canonicalUrl,
      contentHash: doc.contentHash,
      extractionStatus: doc.extractionStatus,
      retrievedAt: doc.retrievedAt,
    });

    try {
      const supabase = getSupabaseClient();
      await supabase.from('source_documents').upsert({
        id: doc.id,
        url: doc.url,
        canonical_url: doc.canonicalUrl,
        content_type: doc.contentType,
        http_status: doc.httpStatus,
        content_hash: doc.contentHash,
        retrieved_at: doc.retrievedAt,
        extraction_status: doc.extractionStatus,
        is_pdf: doc.isPdf,
        requires_js: doc.requiresJs,
        full_text: doc.text ? doc.text.slice(0, 100000) : '',
        page_count: doc.pageCount || 1,
        evidence_metadata: doc.evidenceMetadata || {},
      });
    } catch (err) {
      AuditLoggerService.log({
        taskName: 'supabase_writer',
        url: doc.url,
        operation: 'saveSourceDocument',
        status: 'WARN',
        error: `Supabase write failed, buffered locally: ${String(err)}`,
        retryCount: 0,
        durationMs: 0,
      });
    }
  }

  /**
   * Persist a fully normalized internship offer, its sources, researchers, and emails
   */
  public static async saveInternshipOffer(offer: ParsedInternshipOffer): Promise<void> {
    this.appendLocalFile('internship_offers.json', offer);

    try {
      const supabase = getSupabaseClient();

      // 1. Upsert internship_offers
      await supabase.from('internship_offers').upsert({
        id: offer.id,
        title: offer.title,
        employer: offer.employer,
        laboratory: offer.laboratory,
        country: offer.country,
        city: offer.city,
        description: offer.description,
        deadline: offer.deadline,
        duration_months: offer.durationMonths,
        start_date: offer.startDate,
        compensation_status: offer.compensationStatus,
        stipend_amount: offer.stipendAmount,
        stipend_currency: offer.stipendCurrency,
        eligibility: offer.eligibility,
        application_url: offer.applicationUrl,
        final_status: offer.finalStatus,
        score: offer.score,
        technical_domain: offer.technicalDomain,
        skills: offer.skills,
        is_direct_email: offer.isDirectEmail,
        created_at: offer.createdAt,
        updated_at: offer.updatedAt,
      });

      // 2. Offer Sources
      for (const src of offer.sources) {
        await supabase.from('offer_sources').upsert({
          offer_id: offer.id,
          source_url: src.sourceUrl,
          evidence_snippets: src.evidenceSnippets,
          source_type: src.sourceType,
          discovered_at: src.discoveredAt,
        });
      }

      // 3. Researchers, Links, and Emails
      for (const link of offer.supervisors) {
        const res = link.researcher;
        await supabase.from('researchers').upsert({
          id: res.id,
          full_name: res.fullName,
          clean_name: res.cleanName,
          institution: res.institution || offer.employer,
          laboratory: res.laboratory || offer.laboratory,
          profile_url: res.profileUrl,
          primary_role: link.relationshipRole,
        });

        await supabase.from('offer_researchers').upsert({
          offer_id: offer.id,
          researcher_id: res.id,
          relationship_role: link.relationshipRole,
          confidence_status: link.confidenceStatus,
          supporting_evidence: link.supportingEvidence,
        });

        for (const em of res.emails) {
          await supabase.from('researcher_emails').upsert({
            researcher_id: res.id,
            email_address: em.address,
            verification_status: em.status,
            source_url: em.sourceUrl,
            evidence_snippet: em.evidenceSnippet,
            last_checked: em.lastChecked,
            verification_notes: em.verificationNotes,
          });
        }
      }

      // 4. Review Queue if pending review
      if (offer.eligibility === 'PENDING_REVIEW') {
        await supabase.from('review_queue').upsert({
          offer_id: offer.id,
          review_reason: 'Offer scored in moderate priority band (50-69) or ambiguous dates.',
          unresolved_questions: ['Verify exact start date and supervisor alignment.'],
          priority: 'MEDIUM',
          approval_status: 'PENDING',
        });
      }
    } catch (err) {
      AuditLoggerService.log({
        taskName: 'supabase_writer',
        url: offer.applicationUrl,
        operation: 'saveInternshipOffer',
        status: 'WARN',
        error: `Supabase write failed, buffered locally: ${String(err)}`,
        retryCount: 0,
        durationMs: 0,
      });
    }
  }

  /**
   * Persist pipeline logs in batch
   */
  public static async savePipelineLogs(logs: PipelineAuditLog[]): Promise<void> {
    if (!logs || logs.length === 0) return;
    this.appendLocalFile('pipeline_logs.json', logs);

    try {
      const supabase = getSupabaseClient();
      const records = logs.map(l => ({
        id: l.id,
        run_id: l.runId,
        task_name: l.taskName,
        url: l.url,
        operation: l.operation,
        status: l.status,
        error: l.error,
        retry_count: l.retryCount,
        duration_ms: l.durationMs,
        created_at: l.createdAt,
      }));
      await supabase.from('pipeline_logs').insert(records);
    } catch (err) {
      // Local fallback logged
    }
  }
}
