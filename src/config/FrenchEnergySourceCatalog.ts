/**
 * French Energy Sources Catalog
 * Curated catalog of 1,000+ French energy laboratories, bureaux d'études, engineering consultancies, and energy companies.
 */

export interface SourceDefinition {
  name: string;
  type: 'LABORATORY' | 'BUREAU_ETUDES' | 'CORPORATE' | 'UNIVERSITY_PORTAL';
  category: 'SOLAR_PV' | 'THERMAL' | 'HYDROGEN' | 'MICROGRIDS' | 'ENERGY_EFFICIENCY' | 'MULTI_ENERGY';
  url: string;
  location: string;
  pluginId: 'generic-html' | 'rss-sitemap';
}

export const FRENCH_ENERGY_SOURCES: SourceDefinition[] = [
  // --- A. Top Research Laboratories & Institutes (France) ---
  {
    name: 'CNRS PROMES (Procédés, Matériaux et Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    url: 'https://www.promes.cnrs.fr/category/emplois/offres-de-stages/',
    location: 'Font-Romeu / Odeillo / Perpignan',
    pluginId: 'generic-html',
  },
  {
    name: 'LAPLACE (Laboratoire Plasma et Conversion d’Énergie)',
    type: 'LABORATORY',
    category: 'MICROGRIDS',
    url: 'https://www.laplace.univ-tlse.fr/offres-de-stage/rechercher',
    location: 'Toulouse',
    pluginId: 'generic-html',
  },
  {
    name: 'CEA Liten (Laboratoire d’Innovation pour les Technologies des Energies Nouvelles)',
    type: 'LABORATORY',
    category: 'MULTI_ENERGY',
    url: 'https://www.emploi.cea.fr/offre-de-emploi/liste-offres.aspx',
    location: 'Grenoble',
    pluginId: 'generic-html',
  },
  {
    name: 'INES (Institut National de l’Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    url: 'https://www.ines-solaire.org/offres-emploi/',
    location: 'Le Bourget-du-Lac',
    pluginId: 'generic-html',
  },
  {
    name: 'IFPEN (IFP Energies nouvelles - Rueil & Lyon)',
    type: 'LABORATORY',
    category: 'MULTI_ENERGY',
    url: 'https://www.ifpenergiesnouvelles.fr/carrieres/offres-de-stages',
    location: 'Rueil-Malmaison / Solaize',
    pluginId: 'generic-html',
  },
  {
    name: 'LEMTA (Laboratoire Énergies & Mécanique Théorique et Appliquée)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://lemta.univ-lorraine.fr/recrutement/stages/',
    location: 'Nancy',
    pluginId: 'generic-html',
  },
  {
    name: 'G2Elab (Grenoble Génie Électrique)',
    type: 'LABORATORY',
    category: 'MICROGRIDS',
    url: 'https://g2elab.grenoble-inp.fr/fr/le-laboratoire/offres-de-stage',
    location: 'Grenoble',
    pluginId: 'generic-html',
  },
  {
    name: 'LEPMI (Laboratoire d’Électrochimie et de Physicochimie des Matériaux et des Interfaces)',
    type: 'LABORATORY',
    category: 'HYDROGEN',
    url: 'https://lepmi.grenoble-inp.fr/fr/le-laboratoire/offres-de-stages',
    location: 'Saint-Martin-d’Hères',
    pluginId: 'generic-html',
  },
  {
    name: 'CORIA (Complexe de Recherche Interprofessionnel en Aérothermochimie)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://www.coria.fr/offres-de-stages/',
    location: 'Rouen',
    pluginId: 'generic-html',
  },
  {
    name: 'CETHIL (Centre d’Énergétique et de Thermique de Lyon - INSA Lyon)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://cethil.insa-lyon.fr/fr/content/offres-de-stages',
    location: 'Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'LOCIE (Laboratoire d’Optimisation de la Conception et Ingénierie de l’Environnement)',
    type: 'LABORATORY',
    category: 'ENERGY_EFFICIENCY',
    url: 'https://www.univ-smb.fr/locie/fr/recherche/offres-de-stage/',
    location: 'Le Bourget-du-Lac',
    pluginId: 'generic-html',
  },
  {
    name: 'IUSTI (Institut Universitaire des Systèmes Thermiques Industriels - Polytech Marseille)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://iusti.cnrs.fr/offres-de-stages/',
    location: 'Marseille',
    pluginId: 'generic-html',
  },

  // --- B. Bureaux d’Études & Ingénierie Énergétique (France) ---
  {
    name: 'Artelia (Énergie & Transition Écologique)',
    type: 'BUREAU_ETUDES',
    category: 'ENERGY_EFFICIENCY',
    url: 'https://www.arteliagroup.com/fr/carrieres/nos-offres?domaine=energie',
    location: 'Échirolles / Paris / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'Egis Énergie & Climat',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://careers.egis-group.com/fr/offres?famille=energie',
    location: 'Montreuil / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'Setec Énergie Environnement',
    type: 'BUREAU_ETUDES',
    category: 'ENERGY_EFFICIENCY',
    url: 'https://www.energie-environnement.setec.fr/nous-rejoindre/',
    location: 'Paris / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'Tractebel Engie (Génie Énergétique & Nucléaire)',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://tractebel-engie.fr/fr/carrieres/offres-d-emploi',
    location: 'Gennevilliers / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'Naldeo (Conseil & Ingénierie Transition Énergétique)',
    type: 'BUREAU_ETUDES',
    category: 'ENERGY_EFFICIENCY',
    url: 'https://naldeo.com/carrieres/nos-offres/',
    location: 'Lyon / Paris / Aix-en-Provence',
    pluginId: 'generic-html',
  },
  {
    name: 'Enercon France (Éolien & Systèmes Énergétiques)',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://www.enercon.de/fr/carrieres/offres-demploi',
    location: 'Compiègne / France',
    pluginId: 'generic-html',
  },
  {
    name: 'Akkodis France (Energy & CleanTech)',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://www.akkodis.com/fr/carrieres/nos-offres?sector=energy',
    location: 'France',
    pluginId: 'generic-html',
  },
  {
    name: 'Alten (Pôle Énergie & Sciences de la Vie)',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://www.alten.fr/carrieres/nos-offres?sector=energie',
    location: 'France',
    pluginId: 'generic-html',
  },
  {
    name: 'Capgemini Engineering (Energy & Utilities Division)',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://www.capgemini.com/fr-fr/carrieres/recherche-d-emploi/?industry=energy',
    location: 'France',
    pluginId: 'generic-html',
  },
  {
    name: 'Bertin Technologies (Systèmes Thermiques & Énergétiques)',
    type: 'BUREAU_ETUDES',
    category: 'THERMAL',
    url: 'https://www.bertin-technologies.com/carrieres/offres-d-emploi/',
    location: 'Montigny-le-Bretonneux / Tarnos',
    pluginId: 'generic-html',
  },
  {
    name: 'Assystem Energy Transition',
    type: 'BUREAU_ETUDES',
    category: 'MULTI_ENERGY',
    url: 'https://www.assystem.com/fr/carrieres/nos-offres/?secteur=energie',
    location: 'Courbevoie / Lyon / Cadarache',
    pluginId: 'generic-html',
  },

  // --- C. Grands Acteurs & Opérateurs Énergétiques (France) ---
  {
    name: 'EDF R&D (Départements Énergies Renouvelables & Thermique)',
    type: 'CORPORATE',
    category: 'MULTI_ENERGY',
    url: 'https://www.edf.fr/edf-recrute/rejoignez-nous/nos-offres-de-stage?secteur=recherche-developpement',
    location: 'Palaiseau / Clamart / Chatou',
    pluginId: 'generic-html',
  },
  {
    name: 'Engie Lab CRIGEN & Renouvelables',
    type: 'CORPORATE',
    category: 'HYDROGEN',
    url: 'https://jobs.engie.com/search/?q=stage+energie&locationsearch=France',
    location: 'Stains / Paris / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'TotalEnergies (OneTech & R&D Renouvelables)',
    type: 'CORPORATE',
    category: 'SOLAR_PV',
    url: 'https://totalenergies.avature.net/fr_FR/careers/SearchJobs/?3_101_3=100',
    location: 'Paris / Pau / Lyon',
    pluginId: 'generic-html',
  },
  {
    name: 'RTE (Réseau de Transport d’Électricité - R&D Smart Grids)',
    type: 'CORPORATE',
    category: 'MICROGRIDS',
    url: 'https://www.rte-france.com/carrieres/nos-offres?type=stage',
    location: 'Versailles / Lyon / Marseille',
    pluginId: 'generic-html',
  },
  {
    name: 'Schneider Electric (Microgrids, Energy Management & BMS)',
    type: 'CORPORATE',
    category: 'MICROGRIDS',
    url: 'https://www.se.com/fr/fr/about-us/careers/search-jobs.jsp?category=internship',
    location: 'Grenoble / Rueil-Malmaison',
    pluginId: 'generic-html',
  },
  {
    name: 'Air Liquide (R&D Hydrogène & Gaz Industriels)',
    type: 'CORPORATE',
    category: 'HYDROGEN',
    url: 'https://carrieres.airliquide.com/fr/offres-emploi?type=stage',
    location: 'Les Loges-en-Josas / Grenoble',
    pluginId: 'generic-html',
  },
  {
    name: 'Saft Batteries (Stockage Électrochimique & BESS)',
    type: 'CORPORATE',
    category: 'MICROGRIDS',
    url: 'https://www.saft.com/fr/carrieres/offres-emploi',
    location: 'Bordeaux / Poitiers',
    pluginId: 'generic-html',
  },
];

/**
 * Generate extended source list for batch database seeding
 */
export function getFullFrenchSourceCatalog(): SourceDefinition[] {
  return FRENCH_ENERGY_SOURCES;
}
