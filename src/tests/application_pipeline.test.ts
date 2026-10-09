import { describe, it, expect } from 'vitest';
import { EligibilityFilterStage } from '../pipeline/EligibilityFilterStage.js';
import { CanonicalInternship } from '../models/DomainModels.js';
import { applicationTailoringService } from '../services/ApplicationTailoringService.js';
import { supervisorScoutService } from '../services/SupervisorScoutService.js';

describe('PFE Scout Core Pipeline Tests', () => {
  it('EligibilityFilter: should exclude Tunisia and Germany, and accept & prioritize France', () => {
    const filter = new EligibilityFilterStage();

    const sampleItems: CanonicalInternship[] = [
      {
        id: '1',
        title: 'Stage PFE Modélisation Solaire',
        companyName: 'CNRS PROMES',
        location: 'Font-Romeu, France',
        applyUrl: 'https://promes.cnrs.fr/1',
        canonicalUrl: 'https://promes.cnrs.fr/1',
        contentHash: 'hash1',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        title: 'Energy Intern',
        companyName: 'Tunis Energy',
        location: 'Tunis, Tunisia',
        applyUrl: 'https://tunis.tn/1',
        canonicalUrl: 'https://tunis.tn/1',
        contentHash: 'hash2',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        title: 'Photovoltaic Thesis Intern',
        companyName: 'Fraunhofer ISE',
        location: 'Freiburg, Germany',
        applyUrl: 'https://fraunhofer.de/1',
        canonicalUrl: 'https://fraunhofer.de/1',
        contentHash: 'hash3',
        skills: ['Solar'],
        isRemote: false,
        status: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = filter.process(sampleItems);
    expect(result.filtered.length).toBe(1);
    expect(result.filtered[0].companyName).toBe('CNRS PROMES');
    expect(result.filtered[0].country).toBe('France');
    expect(result.rejectedCount).toBe(2);
  });

  it('ApplicationTailoringService: should pick the correct CV track for thermal vs microgrid offers', () => {
    const thermalPick = applicationTailoringService.selectBestCvTrack('Optimisation échangeurs de chaleur et bilan thermique');
    expect(thermalPick.track).toBe('CV_Seif_Thermicien');
    expect(thermalPick.fileName).toBe('CV_Seif_Thermicien.pdf');

    const microgridPick = applicationTailoringService.selectBestCvTrack('Microgrid control and battery storage management');
    expect(microgridPick.track).toBe('CV_Seif_Reseaux_Microgrids');
    expect(microgridPick.fileName).toBe('CV_Seif_Reseaux_Microgrids.pdf');

    const solarPick = applicationTailoringService.selectBestCvTrack('Modélisation système photovoltaïque et production hydrogène');
    expect(solarPick.track).toBe('CV_Seif_Energies_Renouvelables');
    expect(solarPick.fileName).toBe('CV_Seif_Energies_Renouvelables.pdf');
  });

  it('SupervisorScoutService: should filter out TN and DE and load French & International supervisors', () => {
    const list = supervisorScoutService.loadSupervisors();
    expect(list.length).toBeGreaterThan(0);
    // Ensure no excluded country is in the processed list
    const hasTunisia = list.some(s => s.country === 'TN' || s.country === 'Tunisia');
    const hasGermany = list.some(s => s.country === 'DE' || s.country === 'Germany');
    expect(hasTunisia).toBe(false);
    expect(hasGermany).toBe(false);
  });
});
