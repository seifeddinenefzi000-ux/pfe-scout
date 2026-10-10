import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SafeHttpFetcherService } from '../deep_research/http_fetcher';
import { HtmlExtractorService } from '../deep_research/html_extractor';
import { PdfExtractorService } from '../deep_research/pdf_extractor';
import { EmailFinderService } from '../deep_research/email_finder';
import { EmailVerifierService } from '../deep_research/email_verifier';
import { SupervisorResolverService } from '../deep_research/supervisor_resolver';
import { OfferParserService } from '../deep_research/offer_parser';
import { OfferDeduplicatorService } from '../deep_research/offer_deduplicator';
import { EligibilityRankerService } from '../deep_research/eligibility_ranker';
import { ParsedInternshipOffer } from '../deep_research/types';

describe('Deep Research Engine - Unit & Integration Tests', () => {
  // 1. SSRF Protection Tests
  describe('SafeHttpFetcherService (SSRF Hardening)', () => {
    it('blocks localhost and private IPv4 ranges', async () => {
      const resLocal = await SafeHttpFetcherService.fetch('http://127.0.0.1:8080/test');
      expect(resLocal.ok).toBe(false);
      expect(resLocal.error).toContain('SSRF Guard rejected');

      const resPrivate = await SafeHttpFetcherService.fetch('http://192.168.1.5/admin');
      expect(resPrivate.ok).toBe(false);
      expect(resPrivate.error).toContain('SSRF Guard rejected');

      const res10 = await SafeHttpFetcherService.fetch('http://10.0.0.1/status');
      expect(res10.ok).toBe(false);
      expect(res10.error).toContain('SSRF Guard rejected');
    });

    it('blocks link-local and cloud metadata addresses', async () => {
      const resMeta = await SafeHttpFetcherService.fetch('http://169.254.169.254/latest/meta-data/');
      expect(resMeta.ok).toBe(false);
      expect(resMeta.error).toContain('SSRF Guard rejected');
    });
  });

  // 2. HTML Extraction Tests
  describe('HtmlExtractorService', () => {
    it('decodes HTML entities and parses JSON-LD', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Stage &eacute;nergies renouvelables &amp; microgrids</title>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org/",
                "@type": "JobPosting",
                "title": "Optimisation Microgrid Solaire",
                "hiringOrganization": { "@type": "Organization", "name": "INES CEA" }
              }
            </script>
          </head>
          <body>
            <main>
              <h1>Sujet : Mod&eacute;lisation BESS &amp; PV</h1>
              <p>Contactez-nous &agrave; <a href="mailto:supervisor@ines-solaire.org">ce mail</a></p>
              <a href="/docs/sujet_stage_2027.pdf">T&eacute;l&eacute;charger l'offre PDF</a>
            </main>
          </body>
        </html>
      `;

      const result = HtmlExtractorService.extract(sampleHtml, 'https://www.ines-solaire.org/stages');

      expect(result.cleanText).toContain('Modélisation BESS & PV');
      expect(result.jsonLdJobs.length).toBe(1);
      expect(result.jsonLdJobs[0].title).toBe('Optimisation Microgrid Solaire');
      expect(result.mailtos).toContain('supervisor@ines-solaire.org');
      expect(result.discoveredPdfs[0]).toBe('https://www.ines-solaire.org/docs/sujet_stage_2027.pdf');
    });
  });

  // 3. PDF Extraction Tests
  describe('PdfExtractorService', () => {
    it('extracts text page-by-page and detects OCR thresholds accurately', async () => {
      const resumePath = path.resolve(process.cwd(), 'data', 'resumes', 'SeifEddine_Nefzi_Resume_FR.pdf');
      if (fs.existsSync(resumePath)) {
        const buffer = fs.readFileSync(resumePath);
        const result = await PdfExtractorService.extractPdf(buffer);

        expect(result.totalPages).toBeGreaterThanOrEqual(1);
        expect(result.pages[0].charCount).toBeGreaterThan(50);
        expect(result.pages[0].needsOcr).toBe(false);
        expect(result.needsOcrFallback).toBe(false);
        expect(result.fullText).toContain('Seif Eddine');
      }
    });
  });

  // 4. Email Finder & Obfuscation Normalization Tests
  describe('EmailFinderService', () => {
    it('extracts standard email addresses', () => {
      const text = 'Veuillez envoyer votre candidature à stephane.averty@cea.fr avant le 15 décembre.';
      const emails = EmailFinderService.extractEmails(text);
      expect(emails.length).toBe(1);
      expect(emails[0].normalizedEmail).toBe('stephane.averty@cea.fr');
    });

    it('de-obfuscates text patterns like [at] and [dot]', () => {
      const text = 'Contact: stephane.averty [at] cea [dot] fr ou contact(at)ines-solaire(dot)com.';
      const emails = EmailFinderService.extractEmails(text);
      const addresses = emails.map(e => e.normalizedEmail);
      expect(addresses).toContain('stephane.averty@cea.fr');
      expect(addresses).toContain('contact@ines-solaire.com');
    });

    it('rejects invalid or image filenames', () => {
      expect(EmailFinderService.isValidEmailSyntax('logo@image.png')).toBe(false);
      expect(EmailFinderService.isValidEmailSyntax('invalid-no-domain')).toBe(false);
      expect(EmailFinderService.isValidEmailSyntax('user@domain.com')).toBe(false); // example filter
      expect(EmailFinderService.isValidEmailSyntax('valid.user@cea.fr')).toBe(true);
    });
  });

  // 5. Email Verification & Evidence Hierarchy (E1-E7)
  describe('EmailVerifierService', () => {
    it('classifies generic mailboxes as E5_GENERIC_CONTACT', () => {
      const resRecrut = EmailVerifierService.classifyEmail('recrutement@cea.fr', { isOfficialDocument: true });
      expect(resRecrut.status).toBe('E5_GENERIC_CONTACT');
      expect(resRecrut.isGeneric).toBe(true);
      expect(EmailVerifierService.isAcceptableSupervisorEmail(resRecrut.status)).toBe(false);

      const resContact = EmailVerifierService.classifyEmail('contact@ines.org', { isOfficialDocument: true });
      expect(resContact.status).toBe('E5_GENERIC_CONTACT');
    });

    it('classifies supervisor linked email in official doc as E1_OFFICIAL_DIRECT', () => {
      const resDirect = EmailVerifierService.classifyEmail('stephane.averty@cea.fr', {
        supervisorName: 'Stéphane Averty',
        isOfficialDocument: true,
        contextSnippet: 'Encadrant : Dr. Stéphane Averty (stephane.averty@cea.fr)',
      });
      expect(resDirect.status).toBe('E1_OFFICIAL_DIRECT');
      expect(EmailVerifierService.isAcceptableSupervisorEmail(resDirect.status)).toBe(true);
    });

    it('classifies unverified candidates as E4 and never approves guessed emails', () => {
      const resUnverified = EmailVerifierService.classifyEmail('random.person@cea.fr', {
        isOfficialDocument: true,
      });
      expect(resUnverified.status).toBe('E4_UNVERIFIED_CANDIDATE');
      expect(EmailVerifierService.isAcceptableSupervisorEmail(resUnverified.status)).toBe(false);
    });
  });

  // 6. Supervisor Resolver Tests
  describe('SupervisorResolverService', () => {
    it('resolves explicit supervisor and cleans titles', () => {
      const sampleText = `
        Sujet : Gestion d'énergie microgrid hybride
        Encadrant : Dr. Stéphane Averty (stephane.averty@cea.fr)
        Laboratoire : CEA LITEN
      `;
      const candidates = EmailFinderService.extractEmails(sampleText);
      const links = SupervisorResolverService.resolveSupervisors(
        sampleText,
        'https://cea.fr/offer',
        true,
        candidates
      );

      expect(links.length).toBe(1);
      expect(links[0].relationshipRole).toBe('SUPERVISOR');
      expect(links[0].confidenceStatus).toBe('SUPERVISOR_EXPLICIT');
      expect(links[0].researcher.fullName).toBe('Stéphane Averty');
      expect(links[0].researcher.emails.length).toBe(1);
      expect(links[0].researcher.emails[0].address).toBe('stephane.averty@cea.fr');
      expect(links[0].researcher.emails[0].status).toBe('E1_OFFICIAL_DIRECT');
    });
  });

  // 7. Offer Parser Tests
  describe('OfferParserService', () => {
    it('extracts duration, compensation, and technical domain', () => {
      const sampleText = `
        Offre de stage PFE : Optimisation de stockage batterie BESS pour microgrid solaire
        Organisme : CEA LITEN
        Lieu : Le Bourget-du-Lac, France
        Durée : 6 mois (janvier 2027 - juin 2027)
        Gratification de stage légale assurée.
        Compétences requises : Python, MATLAB, modélisation BESS, dimensionnement photovoltaïque.
      `;

      const offer = OfferParserService.parseOffer({
        url: 'https://cea.fr/stage-bess',
        text: sampleText,
      });

      expect(offer.employer).toBe('INES - CEA LITEN');
      expect(offer.country).toBe('France');
      expect(offer.durationMonths).toBe(6);
      expect(offer.compensationStatus).toBe('LEGAL_GRATIFICATION');
      expect(offer.technicalDomain).toBe('BATTERIES_BESS');
      expect(offer.skills).toContain('Python');
      expect(offer.skills).toContain('MATLAB');
    });
  });

  // 8. Deduplication Tests
  describe('OfferDeduplicatorService', () => {
    it('deduplicates identical offers and aggregates source evidence', () => {
      const offer1: ParsedInternshipOffer = {
        id: 'off_1',
        title: 'Optimisation Microgrid Hybride',
        employer: 'CEA LITEN',
        country: 'France',
        description: 'Description 1',
        compensationStatus: 'LEGAL_GRATIFICATION',
        eligibility: 'ELIGIBLE',
        applicationUrl: 'https://cea.fr/offer1',
        finalStatus: 'DISCOVERED',
        score: 85,
        technicalDomain: 'ENERGY_SYSTEMS_OPTIMIZATION',
        skills: ['Python'],
        isDirectEmail: true,
        sources: [{ sourceUrl: 'https://cea.fr/offer1', evidenceSnippets: ['Snippet 1'], sourceType: 'OFFICIAL_PAGE', discoveredAt: '' }],
        supervisors: [],
        evidenceSnippets: ['Snippet 1'],
        createdAt: '',
        updatedAt: '',
      };

      const offer2: ParsedInternshipOffer = {
        ...offer1,
        id: 'off_2',
        applicationUrl: 'https://cea.fr/offer1?utm_source=rss',
        sources: [{ sourceUrl: 'https://cea.fr/offer1?utm_source=rss', evidenceSnippets: ['Snippet 2'], sourceType: 'PORTAL_API', discoveredAt: '' }],
        evidenceSnippets: ['Snippet 2'],
      };

      const merged = OfferDeduplicatorService.deduplicate([offer1, offer2]);
      expect(merged.length).toBe(1);
      expect(merged[0].sources.length).toBe(2);
      expect(merged[0].evidenceSnippets).toContain('Snippet 1');
      expect(merged[0].evidenceSnippets).toContain('Snippet 2');
    });
  });

  // 9. Eligibility Ranker Tests
  describe('EligibilityRankerService', () => {
    it('prioritizes France (+35) and Jan-Feb 2027 (+25) with legal gratification (+15)', () => {
      const baseOffer: ParsedInternshipOffer = {
        id: 'off_test',
        title: 'Stage PFE Photovoltaïque et Microgrid',
        employer: 'INES CEA',
        country: 'France',
        description: 'Microgrid solaire et stockage',
        startDate: 'Janvier 2027',
        durationMonths: 6,
        compensationStatus: 'LEGAL_GRATIFICATION',
        eligibility: 'PENDING_REVIEW',
        applicationUrl: 'https://ines.fr/stage',
        finalStatus: 'DISCOVERED',
        score: 0,
        technicalDomain: 'SOLAR_PHOTOVOLTAIC',
        skills: ['Python', 'Microgrid'],
        isDirectEmail: true,
        sources: [],
        supervisors: [
          {
            researcher: {
              id: 'r1',
              fullName: 'Dr. Test',
              cleanName: 'drtest',
              emails: [{ address: 'test@cea.fr', status: 'E1_OFFICIAL_DIRECT', sourceUrl: '', evidenceSnippet: '', lastChecked: '' }],
              identityEvidence: [],
            },
            relationshipRole: 'SUPERVISOR',
            confidenceStatus: 'SUPERVISOR_EXPLICIT',
            supportingEvidence: [],
          },
        ],
        evidenceSnippets: [],
        createdAt: '',
        updatedAt: '',
      };

      const { score, eligibility, breakdown } = EligibilityRankerService.rankOffer(baseOffer);
      expect(breakdown.geographicScore).toBe(35);
      expect(breakdown.startWindowScore).toBe(25);
      expect(breakdown.durationScore).toBe(20);
      expect(score).toBeGreaterThanOrEqual(70);
      expect(eligibility).toBe('ELIGIBLE');
    });

    it('penalizes Germany (-50) and rejects Tunisia (-100)', () => {
      const germanOffer: ParsedInternshipOffer = {
        id: 'off_de',
        title: 'Energy internship',
        employer: 'Fraunhofer',
        country: 'Germany',
        description: 'desc',
        compensationStatus: 'PAID',
        eligibility: 'PENDING_REVIEW',
        applicationUrl: 'https://fraunhofer.de',
        finalStatus: 'DISCOVERED',
        score: 0,
        technicalDomain: 'SOLAR_PHOTOVOLTAIC',
        skills: [],
        isDirectEmail: false,
        sources: [],
        supervisors: [],
        evidenceSnippets: [],
        createdAt: '',
        updatedAt: '',
      };

      const rankDe = EligibilityRankerService.rankOffer(germanOffer);
      expect(rankDe.breakdown.geographicScore).toBe(-50);

      const tunisiaOffer: ParsedInternshipOffer = {
        ...germanOffer,
        country: 'Tunisia',
      };
      const rankTn = EligibilityRankerService.rankOffer(tunisiaOffer);
      expect(rankTn.breakdown.geographicScore).toBe(-100);
      expect(rankTn.eligibility).toBe('REJECTED');
    });
  });
});
