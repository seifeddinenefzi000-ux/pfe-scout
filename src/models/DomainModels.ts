export interface CollectedPage {
  url: string;
  content: string;
  headers: Record<string, string>;
  etag?: string;
  lastModified?: string;
  statusCode: number;
  fetchedAt: string;
}

export interface RawInternship {
  title: string;
  companyName: string;
  location?: string;
  description?: string;
  applyUrl: string;
  stipendText?: string;
  deadlineText?: string;
  rawSkills?: string[];
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface CanonicalInternship {
  id?: string;
  sourceId?: string;
  companyName: string;
  title: string;
  description: string;
  location: string;
  country: string;
  isRemote: boolean;
  stipendMin: number | null;
  stipendMax: number | null;
  stipendCurrency: string;
  stipendText: string;
  applyUrl: string;
  canonicalUrl: string;
  contentHash: string;
  deadline: string | null;
  skills: string[];
  status: 'DISCOVERED' | 'NORMALIZED' | 'ENRICHED' | 'MATCHED' | 'RANKED' | 'NOTIFIED' | 'ARCHIVED';
  metadata?: Record<string, unknown>;
  
  // Granular Scores & Explanations
  resumeScore?: number;
  skillMatchScore?: number;
  projectMatchScore?: number;
  educationMatchScore?: number;
  companyScore?: number;
  growthScore?: number;
  deadlineScore?: number;
  stipendScore?: number;
  overallScore?: number;
  confidenceScore?: number;
  matchExplanation?: string;
  
  createdAt?: string;
  updatedAt?: string;
}

export interface SourceEntity {
  id: string;
  name: string;
  type: 'GOVT' | 'UNIVERSITY' | 'CORPORATE' | 'GITHUB' | 'RSS' | 'SITEMAP' | 'PUBLIC_API' | 'DIRECTORY';
  url: string;
  pluginId: string;
  isActive: boolean;
  requestsPerMinute: number;
  maxConcurrency: number;
  crawlDelayMs: number;
  userAgent?: string;
  lastCrawledAt?: string;
  lastHealthStatus: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyEntity {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  ratingScore: number;
  isPrestige: boolean;
  logoUrl?: string;
}

export interface ResumeData {
  name?: string;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startYear?: string;
    endYear?: string;
    gpa?: string;
  }>;
  skills: string[];
  projects: Array<{
    title: string;
    description: string;
    technologies: string[];
    link?: string;
  }>;
  experience: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  achievements: string[];
  certifications: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  rawText: string;
  
  // Resume Diagnostics & Sub-matches
  isParsedSuccessfully: boolean;
  parseErrorReason?: string;
  completenessScore: number;
  skillMatchScore?: number;
  projectMatchScore?: number;
  educationMatchScore?: number;
  overallMatchScore?: number;
}

export interface RankingWeights {
  resumeMatch: number;
  companyPrestige: number;
  careerGrowth: number;
  deadlineUrgency: number;
  stipend: number;
}

export interface UserPriorities {
  prefer_government: boolean;
  prefer_remote: boolean;
  prefer_high_stipend: boolean;
  target_domains: string[];
  allow_international: boolean;
  target_country: string;
}
