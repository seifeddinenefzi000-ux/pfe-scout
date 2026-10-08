import { getSupabaseClient } from '../database/client.js';
import {
  RankingWeights,
  UserPriorities,
} from '../models/DomainModels.js';
import { logger } from '../utils/logger.js';

export class PreferenceRepository {
  private client = getSupabaseClient();

  private defaultWeights: RankingWeights = {
    resumeMatch: 0.40,
    companyPrestige: 0.20,
    careerGrowth: 0.15,
    deadlineUrgency: 0.10,
    stipend: 0.15,
  };

  private defaultPriorities: UserPriorities = {
    prefer_government: true,
    prefer_remote: false,
    prefer_high_stipend: true,

    target_domains: [
      'Renewable Energy',
      'Energy Systems',
      'Energy Engineering',
      'Solar Energy',
      'Photovoltaics',
      'Battery Energy Storage',
      'BESS',
      'Hydrogen',
      'Thermal Energy Storage',
      'Power Systems',
      'Microgrids',
      'Power Electronics',
      'Energy Management',
      'Heat Transfer',
      'Thermodynamics',
      'CFD',
      'AI/ML',
      'MATLAB',
      'Simulink',
    ],

    /*
     * PFE Scout searches internationally.
     * Tunisia is handled by the filtering stage,
     * rather than restricting the system to one
     * target country.
     */
    allow_international: true,
    target_country: 'International',
  };

  async getRankingWeights(): Promise<RankingWeights> {
    try {
      const { data, error } =
        await this.client
          .from('preferences')
          .select('value_json')
          .eq('key', 'ranking_weights')
          .single();

      if (error || !data) {
        return this.defaultWeights;
      }

      return {
        ...this.defaultWeights,
        ...data.value_json,
      };
    } catch (err) {
      logger.error(
        'Error fetching ranking weights, returning defaults',
        {
          error: String(err),
        }
      );

      return this.defaultWeights;
    }
  }

  async getUserPriorities(): Promise<UserPriorities> {
    try {
      const { data, error } =
        await this.client
          .from('preferences')
          .select('value_json')
          .eq('key', 'user_priorities')
          .single();

      if (error || !data) {
        return this.defaultPriorities;
      }

      return {
        ...this.defaultPriorities,
        ...data.value_json,
      };
    } catch (err) {
      logger.error(
        'Error fetching user priorities, returning defaults',
        {
          error: String(err),
        }
      );

      return this.defaultPriorities;
    }
  }

  async saveRankingWeights(
    weights: RankingWeights
  ): Promise<boolean> {
    try {
      const { error } =
        await this.client
          .from('preferences')
          .upsert(
            {
              key: 'ranking_weights',
              value_json: weights,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict: 'key',
            }
          );

      if (error) {
        logger.error(
          'Failed to save ranking weights',
          {
            error: error.message,
          }
        );

        return false;
      }

      return true;
    } catch (err) {
      logger.error(
        'Error in PreferenceRepository.saveRankingWeights',
        {
          error: String(err),
        }
      );

      return false;
    }
  }

  async saveUserPriorities(
    priorities: UserPriorities
  ): Promise<boolean> {
    try {
      const { error } =
        await this.client
          .from('preferences')
          .upsert(
            {
              key: 'user_priorities',
              value_json: priorities,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict: 'key',
            }
          );

      if (error) {
        logger.error(
          'Failed to save user priorities',
          {
            error: error.message,
          }
        );

        return false;
      }

      return true;
    } catch (err) {
      logger.error(
        'Error in PreferenceRepository.saveUserPriorities',
        {
          error: String(err),
        }
      );

      return false;
    }
  }
}