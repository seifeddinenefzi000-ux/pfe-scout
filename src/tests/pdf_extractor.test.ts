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

  it('should extract direct potential supervisor from website offer description with inline email', () => {
    const webDesc = 'Sujet de stage PFE : Commande avancée de convertisseurs. Encadrant : Vincent Debusschere (vincent.debusschere@g2elab.grenoble-inp.fr), laboratoire G2Elab.';
    const { name, email } = pdfInternshipExtractorService.extractSupervisor(webDesc);
    expect(name).toBe('Vincent Debusschere');
    expect(email).toBe('vincent.debusschere@g2elab.grenoble-inp.fr');
  });

  it('should extract direct potential supervisor from English website offer description', () => {
    const webDesc = 'Master Thesis / PFE position: Machine learning for PV forecasting. Supervisor: Prof. Bruno Sareni. Email: bruno.sareni@laplace.univ-tlse.fr';
    const { name, formattedName, email } = pdfInternshipExtractorService.extractSupervisor(webDesc);
    expect(name).toBe('Bruno Sareni');
    expect(formattedName).toBe('Prof. Bruno Sareni');
    expect(email).toBe('bruno.sareni@laplace.univ-tlse.fr');
  });

  it('should infer direct supervisor email when only generic recruiter mailbox is listed in lab offer', () => {
    const webDesc = 'Stage de fin d études au CEA LITEN sur les microgrids solaires. Responsable de stage : Stéphane Averty. Pour postuler, contactez recrutement.liten@cea.fr';
    const { name, email } = pdfInternshipExtractorService.extractSupervisor(webDesc, 'CEA LITEN');
    expect(name).toBe('Stéphane Averty');
    expect(email).toBe('stephane.averty@cea.fr');
  });
});
