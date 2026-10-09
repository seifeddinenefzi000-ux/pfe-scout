import { describe, it, expect } from 'vitest';
import { NormalizationStage } from '../pipeline/NormalizationStage.js';
import { RawInternship } from '../models/DomainModels.js';

describe('NormalizationStage Unit Tests', () => {
  it('should normalize raw internship fields and canonicalize URL', () => {
    const raw: RawInternship = {
      title: '  Energy Engineering Intern  ',
      companyName: '  CEA ',
      location: ' Cadarache, France (Remote flexibility) ',
      applyUrl: 'https://www.emploi.cea.fr/offre-de-emploi/liste-offres.aspx?ref=123#apply',
      stipendText: '1200€ / month',
      deadlineText: '2027-02-28',
      rawSkills: ['Solar PV', 'MATLAB', 'Thermodynamics'],
    };

    const canonical = NormalizationStage.toCanonical(raw, 'source_cea');

    expect(canonical.title).toBe('Energy Engineering Intern');
    expect(canonical.companyName).toBe('CEA');
    expect(canonical.isRemote).toBe(true);
    expect(canonical.canonicalUrl).toBeDefined();
    expect(canonical.stipendMin).toBe(1200);
    expect(canonical.stipendCurrency).toBe('EUR');
    expect(canonical.contentHash).toBeDefined();
  });

  it('should correctly handle missing stipends and default to EUR', () => {
    const raw: RawInternship = {
      title: 'Master 2 Research Intern',
      companyName: 'CNRS PROMES',
      applyUrl: 'https://www.promes.cnrs.fr/stage/123',
    };

    const canonical = NormalizationStage.toCanonical(raw);
    expect(canonical.stipendMin).toBeNull();
    expect(canonical.stipendCurrency).toBe('EUR');
  });
});
