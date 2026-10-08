import { getSupabaseClient } from '../database/client.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export class InternshipRepository {
  private client = getSupabaseClient();

  async existsByHash(contentHash: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('internships')
        .select('id')
        .eq('content_hash', contentHash)
        .limit(1);

      if (error) {
        logger.error('Error checking content hash existence', { error: error.message });
        return false;
      }

      return (data && data.length > 0) || false;
    } catch (err) {
      logger.error('Error in InternshipRepository.existsByHash', { error: String(err) });
      return false;
    }
  }

  async existsByCanonicalUrl(canonicalUrl: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('internships')
        .select('id')
        .eq('canonical_url', canonicalUrl)
        .limit(1);

      if (error) {
        logger.error('Error checking canonical URL existence', { error: error.message });
        return false;
      }

      return (data && data.length > 0) || false;
    } catch (err) {
      logger.error('Error in InternshipRepository.existsByCanonicalUrl', { error: String(err) });
      return false;
    }
  }

  async save(internship: CanonicalInternship): Promise<CanonicalInternship | null> {
    try {
      const dbRow = {
        source_id: internship.sourceId || null,
        company_name: internship.companyName,
        country: internship.country,
        title: internship.title,
        description: internship.description,
        location: internship.location,
        is_remote: internship.isRemote,
        stipend_min: internship.stipendMin,
        stipend_max: internship.stipendMax,
        stipend_currency: internship.stipendCurrency,
        stipend_text: internship.stipendText,
        apply_url: internship.applyUrl,
        canonical_url: internship.canonicalUrl,
        content_hash: internship.contentHash,
        deadline: internship.deadline,
        status: internship.status,
        resume_score: internship.resumeScore || 0,
        company_score: internship.companyScore || 0,
        growth_score: internship.growthScore || 0,
        deadline_score: internship.deadlineScore || 0,
        stipend_score: internship.stipendScore || 0,
        overall_score: internship.overallScore || 0,
        confidence_score: internship.confidenceScore || 1.0,
        match_explanation: internship.matchExplanation || '',
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.client
        .from('internships')
        .upsert(dbRow, { onConflict: 'canonical_url' })
        .select('*')
        .single();

      if (error) {
        logger.error('Failed to save canonical internship', { error: error.message, title: internship.title });
        return null;
      }

      return {
        ...internship,
        id: data.id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      logger.error('Error in InternshipRepository.save', { error: String(err) });
      return null;
    }
  }

  async saveBatch(internships: CanonicalInternship[], chunkSize = 100): Promise<{ savedCount: number; failedCount: number }> {
    if (internships.length === 0) {
      return { savedCount: 0, failedCount: 0 };
    }

    let savedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < internships.length; i += chunkSize) {
      const chunk = internships.slice(i, i + chunkSize);
      const dbRows = chunk.map((item) => ({
        source_id: item.sourceId || null,
        company_name: item.companyName,
        country: item.country,
        title: item.title,
        description: item.description,
        location: item.location,
        is_remote: item.isRemote,
        stipend_min: item.stipendMin,
        stipend_max: item.stipendMax,
        stipend_currency: item.stipendCurrency,
        stipend_text: item.stipendText,
        apply_url: item.applyUrl,
        canonical_url: item.canonicalUrl,
        content_hash: item.contentHash,
        deadline: item.deadline,
        status: item.status,
        resume_score: item.resumeScore || 0,
        company_score: item.companyScore || 0,
        growth_score: item.growthScore || 0,
        deadline_score: item.deadlineScore || 0,
        stipend_score: item.stipendScore || 0,
        overall_score: item.overallScore || 0,
        confidence_score: item.confidenceScore || 1.0,
        match_explanation: item.matchExplanation || '',
        updated_at: new Date().toISOString(),
      }));

      try {
        const { data, error } = await this.client
          .from('internships')
          .upsert(dbRows, { onConflict: 'canonical_url' })
          .select('id');

        if (error) {
          logger.error('Failed to batch save canonical internships chunk', { error: error.message, chunkSize: chunk.length });
          failedCount += chunk.length;
        } else {
          savedCount += data?.length || chunk.length;
        }
      } catch (err) {
        logger.error('Error in InternshipRepository.saveBatch', { error: String(err) });
        failedCount += chunk.length;
      }
    }

    return { savedCount, failedCount };
  }

  async getTopRankedInternships(limit = 10): Promise<CanonicalInternship[]> {
    try {
      const { data, error } = await this.client
        .from('internships')
        .select('*')
        .order('overall_score', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Error fetching top ranked internships', { error: error.message });
        return [];
      }

      return (data || []).map((row: Record<string, any>) => ({
        id: row.id,
        sourceId: row.source_id,
        companyName: row.company_name || 'Unknown',
        title: row.title,
        description: row.description || '',
        location: row.location || 'Unknown',
        country: row.country || 'Unknown',
        isRemote: row.is_remote || false,
        stipendMin: row.stipend_min,
        stipendMax: row.stipend_max,
        stipendCurrency: row.stipend_currency || 'EUR',
        stipendText: row.stipend_text || '',
        applyUrl: row.apply_url,
        canonicalUrl: row.canonical_url,
        contentHash: row.content_hash,
        deadline: row.deadline,
        skills: [],
        status: row.status,
        resumeScore: Number(row.resume_score),
        companyScore: Number(row.company_score),
        growthScore: Number(row.growth_score),
        deadlineScore: Number(row.deadline_score),
        stipendScore: Number(row.stipend_score),
        overallScore: Number(row.overall_score),
        confidenceScore: Number(row.confidence_score),
        matchExplanation: row.match_explanation,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      logger.error('Error in InternshipRepository.getTopRankedInternships', { error: String(err) });
      return [];
    }
  }
}
