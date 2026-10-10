import { describe, it, expect } from 'vitest';
import { pdfInternshipExtractorService } from '../services/PdfInternshipExtractorService.js';

describe('PdfInternshipExtractorService', () => {
  const samplePdfText = `
    INSTITUT NATIONAL DE L'ÉNERGIE SOLAIRE (INES)
    COMMISSARIAT À L'ÉNERGIE ATOMIQUE ET AUX ÉNERGIES ALTERNATIVES (CEA)
    Laboratoire LITEN, Le Bourget-du-Lac (Savoie)

    PROPOSITION DE STAGE DE FIN D'ÉTUDES (PFE) - MASTER 2 / ÉLÈVE INGÉNIEUR
    Année universitaire 2026-2027

    Sujet : Optimisation de la gestion d'énergie d'un microgrid hybride photovoltaïque avec stockage par batteries

    Contexte :
    Dans le cadre du développement des microréseaux résilients, le laboratoire étudie la gestion prédictive
    des flux énergétiques couplant génération photovoltaïque et stockage par batteries (BESS).
    
    Travail demandé :
    - Modélisation sous Python et MATLAB des composants du microréseau.
    - Développement d'algorithmes d'optimisation (programmation dynamique, algorithmes génétiques).
    - Validation numérique sur profil de charge réel.

    Profil recherché :
    Élève ingénieur en dernière année en Génie Énergétique ou Énergies Renouvelables.
    Compétences requises : Python, MATLAB, modélisation de microgrid, optimisation.

    Durée : 6 mois (février à juillet 2027)
    Gratification : Gratification légale de stage

    Encadrant scientifique :
    Dr. Stéphane Averty
    Email : stephane.averty@cea.fr
    Tél : +33 4 79 79 20 00
  `;

  it('should identify a valid PFE internship document', () => {
    const isPfe = pdfInternshipExtractorService.isInternshipPdf(samplePdfText);
    expect(isPfe).toBe(true);
  });

  it('should extract title, supervisor, email and lab correctly', () => {
    const title = pdfInternshipExtractorService.extractTitle(samplePdfText);
    expect(title).toContain('Optimisation de la gestion');

    const { name, email } = pdfInternshipExtractorService.extractSupervisor(samplePdfText);
    expect(name).toBe('Stéphane Averty');
    expect(email).toBe('stephane.averty@cea.fr');

    const org = pdfInternshipExtractorService.extractOrganization(samplePdfText);
    expect(org).toBe('INES - CEA LITEN');

    const location = pdfInternshipExtractorService.extractLocation(samplePdfText);
    expect(location).toContain('Le Bourget-du-Lac');

    const skills = pdfInternshipExtractorService.extractSkills(samplePdfText);
    expect(skills).toContain('Microgrids & EMS');
    expect(skills).toContain('Optimisation énergétique (DP, GA, PSO, LP)');
    expect(skills).toContain('Stockage par batteries (BESS)');
  });

  it('should reject non-internship documents', () => {
    const randomText = 'Règlement général sur la protection des données personnelles. Mentions légales et CGU.';
    const isPfe = pdfInternshipExtractorService.isInternshipPdf(randomText);
    expect(isPfe).toBe(false);
  });
});
