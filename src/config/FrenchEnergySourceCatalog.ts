/**
 * French Energy Sources Catalog
 * Curated catalog of French energy laboratories, renewable producers, storage specialists, and engineering consultancies.
 */

export interface SourceDefinition {
  name: string;
  type: 'LABORATORY' | 'BUREAU_ETUDES' | 'CORPORATE' | 'UNIVERSITY_PORTAL';
  category: 'SOLAR_PV' | 'STORAGE_BESS_STEP' | 'MICROGRIDS' | 'THERMAL' | 'HYDROGEN' | 'MULTI_ENERGY';
  url: string;
  location: string;
  pluginId: 'generic-html' | 'rss-sitemap';
}

export const FRENCH_ENERGY_SOURCES: SourceDefinition[] = [
  // --- 1. Photovoltaïque, Solaire & R&D Renouvelable ---
  {
    name: 'INES (Institut National de l’Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    url: 'https://www.ines-solaire.org/offres-emploi/',
    location: 'Le Bourget-du-Lac (Savoie), France',
    pluginId: 'generic-html',
  },
  {
    name: 'CNRS PROMES (Procédés, Matériaux et Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    url: 'https://www.promes.cnrs.fr/category/emplois/offres-de-stages/',
    location: 'Font-Romeu / Odeillo / Perpignan, France',
    pluginId: 'generic-html',
  },
  {
    name: 'CEA LITEN (Laboratoire d’Innovation pour les Technologies des Énergies Nouvelles)',
    type: 'LABORATORY',
    category: 'STORAGE_BESS_STEP',
    url: 'https://www.emploi.cea.fr/offre-de-emploi/liste-offres.aspx',
    location: 'Grenoble / Chambéry, France',
    pluginId: 'generic-html',
  },
  {
    name: 'IPVF (Institut Photovoltaïque d’Île-de-France)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    url: 'https://ipvf.fr/carrieres/',
    location: 'Palaiseau (Paris-Saclay), France',
    pluginId: 'generic-html',
  },

  // --- 2. Stockage d'Énergie (BESS, STEP, Mécanique, Batteries) ---
  {
    name: 'CNR (Compagnie Nationale du Rhône - 1er Producteur 100% Renouvelable, Hydro & STEP)',
    type: 'CORPORATE',
    category: 'STORAGE_BESS_STEP',
    url: 'https://www.cnr.tm.fr/recrutement/nos-offres/',
    location: 'Lyon / Vallée du Rhône, France',
    pluginId: 'generic-html',
  },
  {
    name: 'Saft Batteries (TotalEnergies - Stockage Stationnaire BESS & Batteries Li-ion)',
    type: 'CORPORATE',
    category: 'STORAGE_BESS_STEP',
    url: 'https://www.saft.com/fr/carrieres/offres-emploi',
    location: 'Bordeaux / Poitiers, France',
    pluginId: 'generic-html',
  },
  {
    name: 'G2Elab (Grenoble Génie Électrique - STEP, Hydro & Microgrids)',
    type: 'LABORATORY',
    category: 'STORAGE_BESS_STEP',
    url: 'https://g2elab.grenoble-inp.fr/fr/le-laboratoire/offres-de-stage',
    location: 'Grenoble, France',
    pluginId: 'generic-html',
  },
  {
    name: 'LEPMI (Électrochimie, Matériaux & Batteries - Grenoble INP)',
    type: 'LABORATORY',
    category: 'STORAGE_BESS_STEP',
    url: 'https://lepmi.grenoble-inp.fr/fr/le-laboratoire/offres-de-stages',
    location: 'Saint-Martin-d’Hères, France',
    pluginId: 'generic-html',
  },

  // --- 3. Microgrids, Smart Grids & Conversion d'Énergie ---
  {
    name: 'LAPLACE (Laboratoire Plasma et Conversion d’Énergie - Microgrids)',
    type: 'LABORATORY',
    category: 'MICROGRIDS',
    url: 'https://www.laplace.univ-tlse.fr/offres-de-stage/rechercher',
    location: 'Toulouse, France',
    pluginId: 'generic-html',
  },
  {
    name: 'Schneider Electric (Microgrids, EMS & Gestion d’Énergie)',
    type: 'CORPORATE',
    category: 'MICROGRIDS',
    url: 'https://www.se.com/fr/fr/about-us/careers/search-jobs.jsp?category=internship',
    location: 'Grenoble / Rueil-Malmaison, France',
    pluginId: 'generic-html',
  },
  {
    name: 'RTE (Réseau de Transport d’Électricité - R&D Smart Grids)',
    type: 'CORPORATE',
    category: 'MICROGRIDS',
    url: 'https://www.rte-france.com/carrieres/nos-offres?type=stage',
    location: 'Versailles / Lyon / Marseille, France',
    pluginId: 'generic-html',
  },

  // --- 4. Grands Développeurs & Producteurs Renouvelables ---
  {
    name: 'Neoen (Leader Mondial Solaire & Stockage Grande Échelle)',
    type: 'CORPORATE',
    category: 'SOLAR_PV',
    url: 'https://neoen.com/fr/carrieres/',
    location: 'Paris, France',
    pluginId: 'generic-html',
  },
  {
    name: 'Voltalia (Énergie Renouvelable & Stockage Hybride)',
    type: 'CORPORATE',
    category: 'MULTI_ENERGY',
    url: 'https://careers.voltalia.com/fr',
    location: 'Aix-en-Provence / Paris, France',
    pluginId: 'generic-html',
  },
  {
    name: 'EDF Renouvelables (Solaire, Éolien & Stockage)',
    type: 'CORPORATE',
    category: 'MULTI_ENERGY',
    url: 'https://www.edf-renouvelables.com/carrieres/rejoignez-nous/',
    location: 'Paris / Montpellier / Lyon, France',
    pluginId: 'generic-html',
  },
  {
    name: 'TotalEnergies Renouvelables France',
    type: 'CORPORATE',
    category: 'SOLAR_PV',
    url: 'https://totalenergies.avature.net/fr_FR/careers/SearchJobs/?3_101_3=100',
    location: 'Paris / Lyon / Pau, France',
    pluginId: 'generic-html',
  },
  {
    name: 'ENGIE Green & Lab CRIGEN',
    type: 'CORPORATE',
    category: 'MULTI_ENERGY',
    url: 'https://jobs.engie.com/search/?q=stage+energie&locationsearch=France',
    location: 'Stains / Montpellier / Lyon, France',
    pluginId: 'generic-html',
  },

  // --- 5. Systèmes Thermiques & Échangeurs Industriels ---
  {
    name: 'LEMTA (Laboratoire Énergies & Mécanique Théorique et Appliquée)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://lemta.univ-lorraine.fr/recrutement/stages/',
    location: 'Nancy, France',
    pluginId: 'generic-html',
  },
  {
    name: 'CETHIL (Centre d’Énergétique et de Thermique de Lyon - INSA)',
    type: 'LABORATORY',
    category: 'THERMAL',
    url: 'https://cethil.insa-lyon.fr/fr/content/offres-de-stages',
    location: 'Lyon, France',
    pluginId: 'generic-html',
  },
  {
    name: 'IFPEN (IFP Énergies nouvelles)',
    type: 'LABORATORY',
    category: 'MULTI_ENERGY',
    url: 'https://www.ifpenergiesnouvelles.fr/carrieres/offres-de-stages',
    location: 'Rueil-Malmaison / Lyon, France',
    pluginId: 'generic-html',
  },
];

export function getFullFrenchSourceCatalog(): SourceDefinition[] {
  return FRENCH_ENERGY_SOURCES;
}
