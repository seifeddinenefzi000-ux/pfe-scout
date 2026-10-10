/**
 * Core Types & Contracts for PFE Scout Deep Research Engine
 */

export type EmailVerificationStatus =
  | 'E1_OFFICIAL_DIRECT'
  | 'E2_OFFICIAL_CORROBORATED'
  | 'E3_PUBLICATION_LISTED'
  | 'E4_UNVERIFIED_CANDIDATE'
  | 'E5_GENERIC_CONTACT'
  | 'E6_INVALID_OR_CONTRADICTED'
  | 'E7_NOT_FOUND';

export type SupervisorConfidenceStatus =
  | 'SUPERVISOR_EXPLICIT'
  | 'SUPERVISOR_CONFIRMED'
  | 'SUPERVISOR_STRONG_MATCH'
  | 'SUPERVISOR_POSSIBLE'
  | 'SUPERVISOR_UNKNOWN';

export type CompensationStatus =
  | 'PAID'
  | 'UNPAID'
  | 'LEGAL_GRATIFICATION'
  | 'UNKNOWN';

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'PENDING_REVIEW'
  | 'REJECTED';

export type OfferFinalStatus =
  | 'DISCOVERED'
  | 'VERIFIED'
  | 'SUPERVISOR_ASSIGNED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'ARCHIVED';

export type TechnicalEnergyDomain =
  | 'SOLAR_PHOTOVOLTAIC'
  | 'BATTERIES_BESS'
  | 'THERMAL_STORAGE_CFD'
  | 'HYDROGEN_FUEL_CELLS'
  | 'ENERGY_SYSTEMS_OPTIMIZATION'
  | 'WIND_OFFSHORE_HYDRO'
  | 'INDUSTRIAL_DECARBONIZATION_SMART_GRIDS'
  | 'GENERAL_ENERGY_ENGINEERING';

export interface SourceDocument {
  id: string;
  url: string;
  canonicalUrl: string;
  contentType: string;
  httpStatus: number;
  contentHash: string;
  retrievedAt: string;
  extractionStatus: 'PENDING' | 'EXTRACTED' | 'OCR_PROCESSED' | 'FAILED';
  isPdf: boolean;
  requiresJs: boolean;
  text: string;
  pageCount?: number;
  evidenceMetadata: Record<string, unknown>;
}

export interface ResearcherRecord {
  id: string;
  fullName: string;
  cleanName: string;
  institution?: string;
  laboratory?: string;
  profileUrl?: string;
  primaryRole?: string;
  emails: ResearcherEmailRecord[];
  identityEvidence: string[];
}

export interface ResearcherEmailRecord {
  address: string;
  status: EmailVerificationStatus;
  sourceUrl: string;
  evidenceSnippet: string;
  lastChecked: string;
  verificationNotes?: string;
}

export interface ParsedInternshipOffer {
  id: string;
  title: string;
  employer: string;
  laboratory?: string;
  country: string;
  city?: string;
  description: string;
  deadline?: string | null;
  durationMonths?: number;
  startDate?: string;
  compensationStatus: CompensationStatus;
  stipendAmount?: number;
  stipendCurrency?: string;
  eligibility: EligibilityStatus;
  applicationUrl: string;
  finalStatus: OfferFinalStatus;
  score: number;
  technicalDomain: TechnicalEnergyDomain;
  skills: string[];
  isDirectEmail: boolean;
  
  // Deterministic Evidence Sources
  sources: OfferSourceRecord[];
  supervisors: OfferResearcherLink[];
  evidenceSnippets: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OfferSourceRecord {
  sourceDocumentId?: string;
  sourceUrl: string;
  evidenceSnippets: string[];
  sourceType: 'OFFICIAL_PAGE' | 'PDF_DOCUMENT' | 'PORTAL_API' | 'RESEARCH_TEAM' | 'STAFF_DIRECTORY';
  discoveredAt: string;
}

export interface OfferResearcherLink {
  researcher: ResearcherRecord;
  relationshipRole: 'SUPERVISOR' | 'PROJECT_LEADER' | 'ADMIN_CONTACT' | 'HR_CONTACT';
  confidenceStatus: SupervisorConfidenceStatus;
  supportingEvidence: string[];
}

export interface SearchRunRecord {
  id: string;
  query: string;
  sourceAdapter: string;
  startedAt: string;
  finishedAt?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  resultsCount: number;
  httpStatus?: number;
  paginationInfo: Record<string, unknown>;
  errorDetails?: string;
  retryCount: number;
}

export interface PipelineAuditLog {
  id: string;
  runId?: string;
  taskName: string;
  url?: string;
  operation: string;
  status: 'SUCCESS' | 'WARN' | 'ERROR';
  error?: string;
  retryCount: number;
  durationMs: number;
  createdAt: string;
}

export interface ReviewQueueItem {
  id: string;
  offerId: string;
  reviewReason: string;
  unresolvedQuestions: string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  approvalStatus: 'PENDING' | 'APPROVED' | 'DISMISSED';
  createdAt: string;
  updatedAt: string;
}
