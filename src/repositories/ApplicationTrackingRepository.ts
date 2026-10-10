import { getSupabaseClient } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { ApplicationDraft } from '../services/ApplicationTailoringService.js';

export class ApplicationTrackingRepository {
  private client = getSupabaseClient();

  /**
   * Check if an offer or supervisor has already been applied to
   */
  async hasAlreadyApplied(targetTitle: string, organization: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('applications')
        .select('id, status')
        .eq('organization', organization)
        .ilike('target_name', `%${targetTitle.substring(0, 30)}%`)
        .limit(1);

      if (error) {
        // If table doesn't exist yet, allow through
        return false;
      }

      return (data || []).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Record application draft in Supabase
   */
  async saveDraft(draft: ApplicationDraft): Promise<void> {
    try {
      await this.client.from('applications').upsert({
        id: draft.id,
        type: draft.type,
        target_name: draft.targetTitle,
        organization: draft.targetOrganization,
        contact_info: draft.targetContact,
        cv_track_used: (draft as any).cvAttachmentName || 'cv_Seif_Eddine_Nefzi.pdf',
        letter_content: draft.coverLetterOrEmailBody,
        status: draft.status,
        created_at: draft.generatedAt,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('Could not persist application to Supabase (storing in local session)', { error: String(err) });
    }
  }

  /**
   * Update status when approved on Telegram
   */
  async updateStatus(applicationId: string, status: 'APPROVED' | 'REJECTED' | 'APPLIED'): Promise<void> {
    try {
      await this.client
        .from('applications')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);
    } catch (err) {
      logger.error('Failed updating application status', { applicationId, error: String(err) });
    }
  }
}

export const applicationTrackingRepo = new ApplicationTrackingRepository();
