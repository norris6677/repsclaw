import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * Clinical Trials API 客户端 (ClinicalTrials.gov)
 * 用于检索临床试验信息
 * 
 * 默认限流：5请求/秒，突发8请求
 */
export class ClinicalTrialsClient {
  private client: AxiosInstance;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://clinicaltrials.gov/api/v2',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // 初始化限流器
    this.rateLimiter = new CombinedRateLimiter(
      { 
        requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 5,
        burstSize: config.rateLimit?.burstSize ?? 8 
      },
      5 // 最大并发数
    );
  }

  /**
   * 执行带限流的 HTTP 请求
   */
  private async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return this.rateLimiter.execute(fn);
  }

  /**
   * 搜索临床试验
   */
  async searchTrials(params: {
    condition: string;
    status?: 'recruiting' | 'completed' | 'active' | 'not_recruiting' | 'all';
    maxResults?: number;
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      condition: string;
      search_status: string;
      total_results: number;
      trials: Array<{
        nct_id: string;
        title: string;
        status: string;
        phase: string[];
        study_type: string;
        conditions: string[];
        locations: Array<{
          facility: string;
          city: string;
          state: string;
          country: string;
        }>;
        sponsor: string;
        url: string;
        eligibility: {
          gender: string;
          min_age: string;
          max_age: string;
          healthy_volunteers: string;
        };
      }>;
    };
    error_message?: string;
  }> {
    const { condition, status = 'recruiting', maxResults = 10 } = params;

    if (!condition) {
      return { status: 'error', error_message: 'Condition is required' };
    }

    const validStatuses = ['recruiting', 'completed', 'active', 'not_recruiting', 'all'];
    const validStatus = validStatuses.includes(status.toLowerCase()) ? status.toLowerCase() : 'recruiting';
    
    const validMaxResults = Math.min(Math.max(maxResults, 1), 100);

    try {
      const requestParams: Record<string, string | number> = {
        'query.cond': condition,
        'pageSize': validMaxResults,
        'format': 'json',
      };

      if (validStatus !== 'all') {
        const statusMap: Record<string, string> = {
          'recruiting': 'RECRUITING',
          'completed': 'COMPLETED',
          'active': 'ACTIVE_NOT_RECRUITING',
          'not_recruiting': 'ACTIVE_NOT_RECRUITING',
        };
        requestParams['filter.overallStatus'] = statusMap[validStatus] || 'RECRUITING';
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get('/studies', { params: requestParams })
      );
      
      const data = response.data;

      let trials: Array<{
        nct_id: string;
        title: string;
        status: string;
        phase: string[];
        study_type: string;
        conditions: string[];
        locations: Array<{
          facility: string;
          city: string;
          state: string;
          country: string;
        }>;
        sponsor: string;
        url: string;
        eligibility: {
          gender: string;
          min_age: string;
          max_age: string;
          healthy_volunteers: string;
        };
      }> = [];
      let totalResults = 0;

      if (data?.studies) {
        totalResults = data.totalCount || data.studies.length;

        trials = data.studies.map((study: Record<string, unknown>) => {
          const protocolSection = study.protocolSection as Record<string, unknown> || {};
          const identification = protocolSection.identificationModule as Record<string, string> || {};
          const statusModule = protocolSection.statusModule as Record<string, string> || {};
          const design = protocolSection.designModule as Record<string, unknown> || {};
          const eligibility = protocolSection.eligibilityModule as Record<string, unknown> || {};
          const contacts = protocolSection.contactsLocationsModule as Record<string, unknown> || {};
          const conditionsModule = protocolSection.conditionsModule as Record<string, string[]> || {};
          const sponsorModule = protocolSection.sponsorCollaboratorsModule as Record<string, Record<string, string>> || {};

          const processedTrial: {
            nct_id: string;
            title: string;
            status: string;
            phase: string[];
            study_type: string;
            conditions: string[];
            locations: Array<{
              facility: string;
              city: string;
              state: string;
              country: string;
            }>;
            sponsor: string;
            url: string;
            eligibility: {
              gender: string;
              min_age: string;
              max_age: string;
              healthy_volunteers: string;
            };
          } = {
            nct_id: identification.nctId || '',
            title: identification.briefTitle || '',
            status: statusModule.overallStatus || '',
            phase: (design.phases as string[]) || [],
            study_type: (design.studyType as string) || '',
            conditions: conditionsModule.conditions || [],
            locations: [],
            sponsor: sponsorModule.leadSponsor?.name || '',
            url: identification.nctId ? `https://clinicaltrials.gov/study/${identification.nctId}` : '',
            eligibility: {
              gender: (eligibility.sex as string) || '',
              min_age: (eligibility.minimumAge as string) || '',
              max_age: (eligibility.maximumAge as string) || '',
              healthy_volunteers: eligibility.healthyVolunteers ? 'Yes' : 'No',
            },
          };

          if (contacts.locations) {
            const locations = Array.isArray(contacts.locations) ? contacts.locations : [contacts.locations];
            processedTrial.locations = locations.slice(0, 3).map((loc: Record<string, unknown>) => {
              const facility = loc.facility as Record<string, string> || {};
              return {
                facility: facility.name || '',
                city: facility.city || '',
                state: facility.state || '',
                country: facility.country || '',
              };
            });
          }

          return processedTrial;
        });
      }

      return {
        status: 'success',
        data: {
          condition,
          search_status: validStatus,
          total_results: totalResults,
          trials,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error searching clinical trials: ${message}` };
    }
  }

  /**
   * 搜索临床试验并返回标准格式
   */
  async search(params: {
    query: string;
    status?: 'recruiting' | 'completed' | 'active' | 'not_recruiting' | 'all';
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    const { query, status = 'recruiting', maxResults = 10 } = params;

    const result = await this.searchTrials({ condition: query, status, maxResults });

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.trials.map(trial => ({
      url: trial.url,
      title: trial.title,
      content: this.formatTrialContent(trial),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'clinical_trials',
        nctId: trial.nct_id,
        trialStatus: trial.status,
        phase: trial.phase,
      },
    }));
  }

  /**
   * 格式化试验内容
   */
  private formatTrialContent(trial: {
    nct_id: string;
    title: string;
    status: string;
    phase: string[];
    study_type: string;
    conditions: string[];
    locations: Array<{
      facility: string;
      city: string;
      state: string;
      country: string;
    }>;
    sponsor: string;
    eligibility: {
      gender: string;
      min_age: string;
      max_age: string;
      healthy_volunteers: string;
    };
  }): string {
    const parts: string[] = [];

    parts.push(`NCT ID: ${trial.nct_id}`);
    parts.push(`Status: ${trial.status}`);
    
    if (trial.phase.length > 0) {
      parts.push(`Phase: ${trial.phase.join(', ')}`);
    }
    
    if (trial.study_type) {
      parts.push(`Study Type: ${trial.study_type}`);
    }
    
    if (trial.conditions.length > 0) {
      parts.push(`Conditions: ${trial.conditions.join(', ')}`);
    }
    
    if (trial.sponsor) {
      parts.push(`Sponsor: ${trial.sponsor}`);
    }
    
    if (trial.locations.length > 0) {
      parts.push('Locations:');
      trial.locations.forEach(loc => {
        parts.push(`  - ${loc.facility}, ${loc.city}, ${loc.state}, ${loc.country}`);
      });
    }
    
    parts.push('Eligibility:');
    parts.push(`  Gender: ${trial.eligibility.gender}`);
    parts.push(`  Age: ${trial.eligibility.min_age} - ${trial.eligibility.max_age}`);
    parts.push(`  Healthy Volunteers: ${trial.eligibility.healthy_volunteers}`);

    return parts.join('\n');
  }
}
