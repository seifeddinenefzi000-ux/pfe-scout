import { ParsedInternshipOffer, EligibilityStatus } from './types.js';
import { AuditLoggerService } from './audit_logger.js';

export interface ScoreBreakdown {
  geographicScore: number;
  startWindowScore: number;
  durationScore: number;
  technicalScore: number;
  compensationScore: number;
  contactScore: number;
  totalScore: number;
  disqualificationReason?: string;
}

export class EligibilityRankerService {
  /**
   * Deterministically rank and classify internship offer eligibility for Seif Eddine Nefzi
   */
  public static rankOffer(offer: ParsedInternshipOffer): {
    score: number;
    eligibility: EligibilityStatus;
    breakdown: ScoreBreakdown;
  } {
    let geographicScore = 0;
    let startWindowScore = 0;
    let durationScore = 0;
    let technicalScore = 0;
    let compensationScore = 0;
    let contactScore = 0;
    let disqualificationReason: string | undefined;

    // 1. Geographic priority
    const country = (offer.country || '').trim().toLowerCase();
    if (country === 'tunisia' || country === 'tunisie') {
      geographicScore = -100;
      disqualificationReason = 'Internship located in Tunisia (PFE must be abroad).';
    } else if (country === 'france') {
      geographicScore = 35;
    } else if (
      ['belgium', 'belgique', 'switzerland', 'suisse', 'netherlands', 'pays-bas', 'ireland', 'irlande', 'united kingdom', 'royaume-uni', 'uk', 'canada', 'united states', 'usa', 'australia', 'australie'].includes(country)
    ) {
      geographicScore = 20;
    } else if (country === 'germany' || country === 'allemagne') {
      geographicScore = -50;
    } else {
      geographicScore = 0;
    }

    // 2. Start Period (Optimal: Jan-Feb 2027)
    const startStr = (offer.startDate || '').toLowerCase();
    if (startStr.includes('janvier 2027') || startStr.includes('février 2027') || startStr.includes('january 2027') || startStr.includes('february 2027') || startStr.includes('début 2027')) {
      startWindowScore = 25;
    } else if (startStr.includes('mars 2027') || startStr.includes('march 2027')) {
      startWindowScore = 15;
    } else if (startStr.includes('2027') || startStr.includes('flexible')) {
      startWindowScore = 10;
    } else if (startStr.includes('2025') || (startStr.includes('2026') && !startStr.includes('fin 2026'))) {
      startWindowScore = -100;
      disqualificationReason = 'Start date is prior to eligible academic graduation window.';
    } else {
      startWindowScore = 5;
    }

    // 3. Duration (Target: 4-6 months)
    const months = offer.durationMonths || 6;
    if (months >= 5 && months <= 6) {
      durationScore = 20;
    } else if (months === 4) {
      durationScore = 10;
    } else if (months < 3 || months > 8) {
      durationScore = -100;
      disqualificationReason = `Duration (${months} months) outside academic guidelines (3-8 months).`;
    } else {
      durationScore = 5;
    }

    // 4. Technical alignment (ENIM Energy Engineering + Master's)
    switch (offer.technicalDomain) {
      case 'SOLAR_PHOTOVOLTAIC':
      case 'BATTERIES_BESS':
        technicalScore = 25;
        break;
      case 'THERMAL_STORAGE_CFD':
      case 'HYDROGEN_FUEL_CELLS':
      case 'ENERGY_SYSTEMS_OPTIMIZATION':
        technicalScore = 20;
        break;
      case 'WIND_OFFSHORE_HYDRO':
      case 'INDUSTRIAL_DECARBONIZATION_SMART_GRIDS':
        technicalScore = 15;
        break;
      case 'GENERAL_ENERGY_ENGINEERING':
        technicalScore = 10;
        break;
      default:
        technicalScore = 5;
    }

    // Boost if student specific skills match
    const studentCoreSkills = ['python', 'matlab', 'microgrid', 'fastapi', 'bess', 'pvsyst', 'cfd'];
    const lowerSkills = offer.skills.map(s => s.toLowerCase());
    const skillMatches = studentCoreSkills.filter(sk => lowerSkills.includes(sk));
    technicalScore += Math.min(10, skillMatches.length * 3);

    // 5. Compensation
    if (offer.compensationStatus === 'PAID' || offer.compensationStatus === 'LEGAL_GRATIFICATION') {
      compensationScore = 15;
    } else if (offer.compensationStatus === 'UNPAID') {
      compensationScore = country === 'france' ? 0 : -30;
    } else {
      compensationScore = 0;
    }

    // 6. Supervisor Contact Availability
    const hasDirectSupervisorEmail = offer.supervisors.some(s =>
      s.researcher.emails.some(e => e.status === 'E1_OFFICIAL_DIRECT' || e.status === 'E2_OFFICIAL_CORROBORATED')
    );

    if (hasDirectSupervisorEmail) {
      contactScore = 15;
      offer.isDirectEmail = true;
    } else if (offer.applicationUrl && offer.applicationUrl.startsWith('http')) {
      contactScore = 5; // Portal application route available
      offer.isDirectEmail = false;
    } else {
      contactScore = -10;
      offer.isDirectEmail = false;
    }

    const totalRaw =
      geographicScore +
      startWindowScore +
      durationScore +
      technicalScore +
      compensationScore +
      contactScore;

    const totalScore = Math.max(0, Math.min(100, totalRaw));

    let eligibility: EligibilityStatus = 'PENDING_REVIEW';
    if (disqualificationReason || geographicScore < 0 || totalScore < 45) {
      eligibility = 'REJECTED';
    } else if (totalScore >= 60) {
      eligibility = 'ELIGIBLE';
    } else {
      eligibility = 'PENDING_REVIEW';
    }

    const breakdown: ScoreBreakdown = {
      geographicScore,
      startWindowScore,
      durationScore,
      technicalScore,
      compensationScore,
      contactScore,
      totalScore,
      disqualificationReason,
    };

    offer.score = totalScore;
    offer.eligibility = eligibility;

    AuditLoggerService.log({
      taskName: 'eligibility_ranker',
      url: offer.applicationUrl,
      operation: 'rankOffer',
      status: 'SUCCESS',
      retryCount: 0,
      durationMs: 0,
    });

    return { score: totalScore, eligibility, breakdown };
  }
}
