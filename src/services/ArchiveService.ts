import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { SupervisorRecord } from './ApplicationTailoringService.js';
import { getSupabaseClient } from '../database/client.js';

export interface ArchivedOfferRecord {
  id: string;
  title: string;
  company: string;
  url: string;
  contentHash: string;
  archivedAt: string;
}

export interface ArchivedSupervisorRecord {
  name: string;
  email: string;
  institution: string;
  searchTopic: string;
  archivedAt: string;
}

export class ArchiveService {
  private archiveDir = path.join(process.cwd(), 'data', 'archive');
  private offersArchivePath = path.join(process.cwd(), 'data', 'archive', 'archived_offers.json');
  private supervisorsArchivePath = path.join(process.cwd(), 'data', 'archive', 'archived_supervisors.json');
  private supabase = getSupabaseClient();

  constructor() {
    this.ensureArchiveDir();
  }

  private ensureArchiveDir(): void {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }
      if (!fs.existsSync(this.offersArchivePath)) {
        fs.writeFileSync(this.offersArchivePath, JSON.stringify([], null, 2));
      }
      if (!fs.existsSync(this.supervisorsArchivePath)) {
        fs.writeFileSync(this.supervisorsArchivePath, JSON.stringify([], null, 2));
      }
    } catch (err) {
      logger.warn('Could not initialize archive directory', { error: String(err) });
    }
  }

  loadArchivedOffers(): ArchivedOfferRecord[] {
    try {
      if (fs.existsSync(this.offersArchivePath)) {
        const raw = fs.readFileSync(this.offersArchivePath, 'utf8');
        return JSON.parse(raw) || [];
      }
    } catch {}
    return [];
  }

  loadArchivedSupervisors(): ArchivedSupervisorRecord[] {
    try {
      if (fs.existsSync(this.supervisorsArchivePath)) {
        const raw = fs.readFileSync(this.supervisorsArchivePath, 'utf8');
        return JSON.parse(raw) || [];
      }
    } catch {}
    return [];
  }

  /**
   * Check if an offer has already been seen / archived (both local JSON and Supabase DB)
   */
  async isOfferArchived(item: CanonicalInternship): Promise<boolean> {
    const itemUrl = (item.applyUrl || item.canonicalUrl || '').toLowerCase().trim();
    const itemHash = item.contentHash;
    const normTitleCompany = `${item.title} ${item.companyName}`.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Check local JSON archive
    const localArchived = this.loadArchivedOffers();
    const isLocal = localArchived.some((a) => {
      const aUrl = (a.url || '').toLowerCase().trim();
      const aHash = a.contentHash;
      const aNorm = `${a.title} ${a.company}`.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        (itemUrl && aUrl && itemUrl === aUrl) ||
        (itemHash && aHash && itemHash === aHash) ||
        (normTitleCompany && aNorm && normTitleCompany === aNorm)
      );
    });

    if (isLocal) return true;

    // 2. Check Supabase internships table
    try {
      const { data } = await this.supabase
        .from('internships')
        .select('id, canonical_url, content_hash')
        .or(`canonical_url.eq."${item.canonicalUrl}",content_hash.eq."${item.contentHash}"`)
        .limit(1);

      if (data && data.length > 0) return true;
    } catch {}

    // 3. Check Supabase applications table
    try {
      const { data: apps } = await this.supabase
        .from('applications')
        .select('id')
        .ilike('target_name', `%${item.title.substring(0, 30)}%`)
        .limit(1);

      if (apps && apps.length > 0) return true;
    } catch {}

    return false;
  }

  /**
   * Permanently archive processed offers
   */
  async archiveOffers(items: CanonicalInternship[]): Promise<void> {
    if (items.length === 0) return;
    this.ensureArchiveDir();

    const current = this.loadArchivedOffers();
    const existingKeys = new Set(current.map((c) => (c.url || c.contentHash).toLowerCase()));

    for (const item of items) {
      const key = (item.applyUrl || item.canonicalUrl || item.contentHash).toLowerCase();
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        current.push({
          id: item.id || `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: item.title,
          company: item.companyName,
          url: item.applyUrl || item.canonicalUrl,
          contentHash: item.contentHash,
          archivedAt: new Date().toISOString(),
        });
      }
    }

    try {
      fs.writeFileSync(this.offersArchivePath, JSON.stringify(current, null, 2));
      logger.info(`ArchiveService: Closed and permanently archived ${items.length} offers.`);
    } catch (e) {
      logger.error('Failed writing to archived_offers.json', { error: String(e) });
    }
  }

  /**
   * Check if a supervisor has already been contacted (both local JSON and Supabase DB)
   */
  async isSupervisorArchived(sup: SupervisorRecord): Promise<boolean> {
    const supEmail = (sup.email || '').toLowerCase().trim();
    const supName = (sup.name || '').toLowerCase().trim();

    // 1. Local JSON check
    const localArchived = this.loadArchivedSupervisors();
    const isLocal = localArchived.some((a) => {
      const aEmail = (a.email || '').toLowerCase().trim();
      const aName = (a.name || '').toLowerCase().trim();
      return (supEmail && aEmail && supEmail === aEmail) || (supName && aName && supName === aName);
    });

    if (isLocal) return true;

    // 2. Check Supabase applications table
    try {
      const { data } = await this.supabase
        .from('applications')
        .select('id')
        .or(`contact_info.eq."${sup.email}",target_name.ilike."%${sup.name}%"`)
        .limit(1);

      if (data && data.length > 0) return true;
    } catch {}

    return false;
  }

  /**
   * Permanently archive contacted supervisors
   */
  async archiveSupervisors(supervisors: SupervisorRecord[]): Promise<void> {
    if (supervisors.length === 0) return;
    this.ensureArchiveDir();

    const current = this.loadArchivedSupervisors();
    const existingEmails = new Set(current.map((c) => (c.email || c.name).toLowerCase()));

    for (const sup of supervisors) {
      const key = (sup.email || sup.name).toLowerCase();
      if (!existingEmails.has(key)) {
        existingEmails.add(key);
        current.push({
          name: sup.name,
          email: sup.email,
          institution: sup.institution,
          searchTopic: sup.searchTopic,
          archivedAt: new Date().toISOString(),
        });
      }

      // Record in Supabase applications table to prevent re-contacting
      try {
        await this.supabase.from('applications').upsert({
          id: `sup_contact_${Buffer.from(sup.email).toString('hex').substring(0, 16)}`,
          type: 'COLD_SUPERVISOR',
          target_name: sup.name,
          organization: sup.institution,
          contact_info: sup.email,
          country: sup.country,
          cv_track_used: 'CV_Seif_Energies_Renouvelables',
          status: 'PENDING_APPROVAL',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    try {
      fs.writeFileSync(this.supervisorsArchivePath, JSON.stringify(current, null, 2));
      logger.info(`ArchiveService: Closed and permanently archived ${supervisors.length} supervisors.`);
    } catch (e) {
      logger.error('Failed writing to archived_supervisors.json', { error: String(e) });
    }
  }
}

export const archiveService = new ArchiveService();
