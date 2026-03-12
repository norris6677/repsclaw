import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * FDA Drug Information API 客户端
 * 用于检索药品信息、标签、不良反应等
 * 
 * 默认限流：4请求/秒，突发5请求
 * FDA 限制：240请求/分钟 = 4请求/秒
 */
export class FDAClient {
  private client: AxiosInstance;
  private apiKey?: string;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.fda.gov/drug',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // 初始化限流器
    // FDA: 240 requests/minute = 4/second
    this.rateLimiter = new CombinedRateLimiter(
      { 
        requestsPerSecond: config.rateLimit?.requestsPerSecond ?? 4,
        burstSize: config.rateLimit?.burstSize ?? 5 
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
   * 提取和清理关键信息
   */
  private extractKeyInfo(data: Record<string, unknown>, searchType: string): Record<string, unknown> {
    const extracted: Record<string, unknown> = {};

    if (!data || typeof data !== 'object' || !data.results) {
      return extracted;
    }

    const results = data.results as Array<Record<string, unknown>>;
    const result = results.length > 0 ? results[0] : {};

    if (searchType === 'label') {
      const openfda = result.openfda as Record<string, string[]>;
      if (openfda) {
        extracted.brand_names = (openfda.brand_name || []).slice(0, 3);
        extracted.generic_names = (openfda.generic_name || []).slice(0, 3);
        extracted.manufacturer = (openfda.manufacturer_name || []).slice(0, 1);
      }

      extracted.indications = this.sanitizeText(result.indications_and_usage as string[]);
      extracted.dosage = this.sanitizeText(result.dosage_and_administration as string[]);
      extracted.warnings = this.sanitizeText(result.warnings_and_cautions as string[]);
      extracted.contraindications = this.sanitizeText(result.contraindications as string[]);
      extracted.adverse_reactions = this.sanitizeText(result.adverse_reactions as string[]);
      extracted.drug_interactions = this.sanitizeText(result.drug_interactions as string[]);
      extracted.pregnancy = this.sanitizeText(result.pregnancy as string[]);
    } else if (searchType === 'adverse_events') {
      const openfda = result.openfda as Record<string, string[]>;
      if (openfda) {
        extracted.brand_names = (openfda.brand_name || []).slice(0, 3);
        extracted.generic_names = (openfda.generic_name || []).slice(0, 3);
      }
      extracted.adverse_reactions = this.sanitizeText(result.adverse_reactions as string[]);
      extracted.warnings = this.sanitizeText(result.warnings_and_cautions as string[]);
      extracted.boxed_warning = this.sanitizeText(result.boxed_warning as string[]);
    } else {
      extracted.generic_name = result.generic_name || '';
      extracted.brand_name = result.brand_name || '';
      extracted.manufacturer = result.labeler_name || '';
      extracted.product_type = result.product_type || '';
      extracted.route = result.route || [];
      extracted.marketing_status = result.marketing_status || '';
    }

    return extracted;
  }

  /**
   * 清理文本
   */
  private sanitizeText(textArray: string[]): string[] {
    if (!Array.isArray(textArray)) {
      return [];
    }

    return textArray.map(text => {
      if (!text) return '';
      
      // 跳过大型HTML表格
      if (text.length > 5000 && (text.toLowerCase().includes('<table') || text.toLowerCase().includes('<td'))) {
        return '[Table content removed due to size]';
      }

      // 移除HTML标签
      let cleanText = text.replace(/<[^>]*>/g, ' ');
      // 移除多余空格
      cleanText = cleanText.replace(/\s+/g, ' ').trim();
      // 截断过长的文本
      if (cleanText.length > 1000) {
        cleanText = cleanText.substring(0, 997) + '...';
      }
      
      return cleanText;
    }).filter(Boolean);
  }

  /**
   * 查找药品信息
   */
  async lookupDrug(params: {
    drugName: string;
    searchType?: 'general' | 'label' | 'adverse_events';
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      drug_name: string;
      search_type: string;
      drugs: Array<Record<string, unknown>>;
      total_results: number;
    };
    error_message?: string;
  }> {
    const { drugName, searchType = 'general' } = params;

    if (!drugName) {
      return { status: 'error', error_message: 'Drug name is required' };
    }

    const normalizedType = ['label', 'adverse_events', 'general'].includes(searchType) 
      ? searchType 
      : 'general';

    try {
      let endpoint: string;
      let query: string;

      if (normalizedType === 'adverse_events' || normalizedType === 'label') {
        endpoint = '/label.json';
        query = `openfda.generic_name:"${drugName}" OR openfda.brand_name:"${drugName}"`;
      } else {
        endpoint = '/ndc.json';
        query = `generic_name:"${drugName}" OR brand_name:"${drugName}"`;
      }

      const requestParams: Record<string, string | number> = {
        search: query,
        limit: 1,
      };

      if (this.apiKey) {
        requestParams.api_key = this.apiKey;
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get(endpoint, { params: requestParams })
      );
      
      const data = response.data;

      const extractedData = this.extractKeyInfo(data, normalizedType);
      const results = data.results as Array<Record<string, unknown>> || [];
      
      const drugs = results.length > 0 
        ? results.map(drug => ({
            product_number: drug.product_ndc || drug.ndc_product_code || '',
            generic_name: drug.generic_name || extractedData.generic_name || '',
            brand_name: drug.brand_name || extractedData.brand_name || '',
            labeler_name: drug.labeler_name || extractedData.manufacturer || '',
            product_type: drug.product_type || extractedData.product_type || '',
            ...extractedData,
          }))
        : [extractedData];

      const meta = data.meta as { results?: { total?: number } };

      return {
        status: 'success',
        data: {
          drug_name: drugName,
          search_type: normalizedType,
          drugs,
          total_results: meta?.results?.total || 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error fetching drug information: ${message}` };
    }
  }

  /**
   * 搜索药品
   */
  async searchDrugs(params: {
    query: string;
    limit?: number;
  }): Promise<ICrawledPage[]> {
    const { query, limit = 10 } = params;

    try {
      const requestParams: Record<string, string | number> = {
        search: `generic_name:"${query}" OR brand_name:"${query}"`,
        limit: limit,
      };

      if (this.apiKey) {
        requestParams.api_key = this.apiKey;
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get('/ndc.json', { params: requestParams })
      );
      
      const data = response.data;
      const results = data.results as Array<Record<string, unknown>> || [];

      return results.map(drug => {
        const productNdc = drug.product_ndc as string || '';
        const content = this.formatDrugContent(drug);
        
        return {
          url: `https://www.accessdata.fda.gov/scripts/cder/ndc/index.cfm`,
          title: (drug.brand_name as string) || (drug.generic_name as string) || 'Unknown Drug',
          content,
          metadata: {
            crawledAt: new Date(),
            statusCode: 200,
            contentType: 'application/json',
            links: [],
            source: 'fda',
            productNdc,
          },
        };
      });
    } catch (error) {
      console.error('FDA search error:', error);
      return [];
    }
  }

  /**
   * 格式化药品内容
   */
  private formatDrugContent(drug: Record<string, unknown>): string {
    const parts: string[] = [];

    if (drug.brand_name) {
      parts.push(`Brand Name: ${drug.brand_name}`);
    }
    if (drug.generic_name) {
      parts.push(`Generic Name: ${drug.generic_name}`);
    }
    if (drug.labeler_name) {
      parts.push(`Manufacturer: ${drug.labeler_name}`);
    }
    if (drug.product_type) {
      parts.push(`Product Type: ${drug.product_type}`);
    }
    if (drug.route) {
      parts.push(`Route: ${Array.isArray(drug.route) ? drug.route.join(', ') : drug.route}`);
    }
    if (drug.marketing_status) {
      parts.push(`Marketing Status: ${drug.marketing_status}`);
    }

    return parts.join('\n');
  }
}
