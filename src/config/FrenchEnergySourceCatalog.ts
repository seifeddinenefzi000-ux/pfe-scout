/**
 * Energy Sources Catalog
 * Curated catalog of premier French and International laboratories (US, Canada, UK, Australia, Switzerland, France)
 * covering Solar PV, Storage (BESS, STEP, Mechanical/Flywheel), Microgrids, and Thermal Systems.
 */

export interface SourceDefinition {
  name: string;
  type: 'LABORATORY' | 'BUREAU_ETUDES' | 'CORPORATE' | 'UNIVERSITY_PORTAL';
  category: 'SOLAR_PV' | 'STORAGE_BESS_STEP' | 'MICROGRIDS' | 'THERMAL' | 'HYDROGEN' | 'MULTI_ENERGY';
  country: 'France' | 'USA' | 'Canada' | 'UK' | 'Australia' | 'Switzerland';
  url: string;
  location: string;
  pluginId: 'generic-html' | 'rss-sitemap';
}

export const GLOBAL_ENERGY_SOURCES: SourceDefinition[] = [
  // --- 1. FRANCE — Premier Research Labs & Renewable Producers ---
  {
    name: 'INES (Institut National de l’Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'France',
    url: 'https://www.ines-solaire.org/offres-emploi/',
    location: 'Le Bourget-du-Lac (Savoie), France',
    pluginId: 'generic-html',
  },
  {
    name: 'CNRS PROMES (Procédés, Matériaux et Énergie Solaire)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'France',
    url: 'https://www.promes.cnrs.fr/category/emplois/offres-de-stages/',
    location: 'Font-Romeu / Odeillo / Perpignan, France',
    pluginId: 'generic-html',
  },
  {
    name: 'CNR (Compagnie Nationale du Rhône - Hydroélectricité & STEP)',
    type: 'CORPORATE',
    category: 'STORAGE_BESS_STEP',
    country: 'France',
    url: 'https://www.cnr.tm.fr/recrutement/nos-offres/',
    location: 'Lyon, France',
    pluginId: 'generic-html',
  },
  {
    name: 'LAPLACE (Laboratoire Plasma et Conversion d’Énergie - Microgrids)',
    type: 'LABORATORY',
    category: 'MICROGRIDS',
    country: 'France',
    url: 'https://www.laplace.univ-tlse.fr/offres-de-stage/rechercher',
    location: 'Toulouse, France',
    pluginId: 'generic-html',
  },
  {
    name: 'Saft Batteries (TotalEnergies - BESS & Stockage Stationnaire)',
    type: 'CORPORATE',
    category: 'STORAGE_BESS_STEP',
    country: 'France',
    url: 'https://www.saft.com/fr/carrieres/offres-emploi',
    location: 'Bordeaux / Poitiers, France',
    pluginId: 'generic-html',
  },
  {
    name: 'G2Elab (Grenoble Génie Électrique - STEP & Smart Grids)',
    type: 'LABORATORY',
    category: 'STORAGE_BESS_STEP',
    country: 'France',
    url: 'https://g2elab.grenoble-inp.fr/fr/le-laboratoire/offres-de-stage',
    location: 'Grenoble, France',
    pluginId: 'generic-html',
  },

  // --- 2. USA — National Labs & Premier Solar/Storage Institutes ---
  {
    name: 'NREL (National Renewable Energy Laboratory - USA)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'USA',
    url: 'https://www.nrel.gov/careers/internships.html',
    location: 'Golden, Colorado, USA',
    pluginId: 'generic-html',
  },

  // --- 3. CANADA — Hydro-Québec & Clean Energy Institutes ---
  {
    name: 'Hydro-Québec IREQ (Institut de recherche d’Hydro-Québec - Canada)',
    type: 'LABORATORY',
    category: 'STORAGE_BESS_STEP',
    country: 'Canada',
    url: 'https://www.hydroquebec.com/carrieres/etudiants-stagiaires/',
    location: 'Varennes / Montréal, Canada',
    pluginId: 'generic-html',
  },

  // --- 4. UK — Oxford & Imperial Energy Labs ---
  {
    name: 'University of Oxford Energy Group (UK)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'UK',
    url: 'https://www.energy.ox.ac.uk/opportunities/',
    location: 'Oxford, United Kingdom',
    pluginId: 'generic-html',
  },

  // --- 5. AUSTRALIA — UNSW SPREE (World #1 Solar PV Institute) ---
  {
    name: 'UNSW Sydney - School of Photovoltaic & Renewable Energy (Australia)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'Australia',
    url: 'https://www.unsw.edu.au/engineering/our-schools/photovoltaic-and-renewable-energy-engineering',
    location: 'Sydney, Australia',
    pluginId: 'generic-html',
  },

  // --- 6. SWITZERLAND — EPFL & ETH Zurich Energy Labs ---
  {
    name: 'EPFL PV-Lab (Photovoltaics and Thin-Film Electronics - Switzerland)',
    type: 'LABORATORY',
    category: 'SOLAR_PV',
    country: 'Switzerland',
    url: 'https://www.epfl.ch/labs/pv-lab/careers/',
    location: 'Neuchâtel / Lausanne, Switzerland',
    pluginId: 'generic-html',
  },
];

export const FRENCH_ENERGY_SOURCES = GLOBAL_ENERGY_SOURCES;

export function getFullFrenchSourceCatalog(): SourceDefinition[] {
  return GLOBAL_ENERGY_SOURCES;
}
