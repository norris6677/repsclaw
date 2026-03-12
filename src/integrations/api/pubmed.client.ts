import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * PubMed API 客户端
 * 用于检索生物医学文献
 * 
 * 默认限流：3请求/秒，突发5请求
 * NCBI 建议：无 API key 时不超过 3请求/秒，有 API key 时不超过 10请求/秒
 */
export class PubMedClient {
  private client: AxiosInstance;
  private apiKey?: string;
  private rateLimiter: CombinedRateLimiter;

  constructor(config: IExternalAPIConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // 初始化限流器
    // 如果有 API key，可以使用更高的限流阈值
    const requestsPerSecond = config.rateLimit?.requestsPerSecond ?? (this.apiKey ? 10 : 3);
    const burstSize = config.rateLimit?.burstSize ?? (this.apiKey ? 10 : 5);
    
    this.rateLimiter = new CombinedRateLimiter(
      { requestsPerSecond, burstSize },
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
   * 搜索文献
   */
  async search(params: {
    query: string;
    maxResults?: number;
    sort?: 'relevance' | 'date';
    retStart?: number;
    dateRange?: string; // years back
    openAccess?: boolean;
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      query: string;
      total_results: number;
      date_range?: string;
      open_access: boolean;
      articles: Array<{
        id: string;
        title: string;
        authors: string[];
        journal: string;
        publication_date: string;
        abstract_url: string;
        doi?: string;
      }>;
    };
    error_message?: string;
  }> {
    const { query, maxResults = 10, sort = 'relevance', dateRange, openAccess = false } = params;

    if (!query) {
      return { status: 'error', error_message: 'Search query is required' };
    }

    const validMaxResults = Math.min(Math.max(maxResults, 1), 100);

    try {
      // 构建查询
      let processedQuery = query;
      if (openAccess) {
        processedQuery += ' AND open access[filter]';
      }
      if (dateRange) {
        try {
          const yearsBack = parseInt(dateRange, 10);
          const currentYear = new Date().getFullYear();
          const minYear = currentYear - yearsBack;
          processedQuery += ` AND ${minYear}:${currentYear}[pdat]`;
        } catch {
          // 忽略无效的日期范围
        }
      }

      // 搜索获取文章ID（带限流）
      const searchParams: Record<string, string | number> = {
        db: 'pubmed',
        term: processedQuery,
        retmax: validMaxResults,
        sort,
        retstart: params.retStart || 0,
        retmode: 'json',
      };

      if (this.apiKey) {
        searchParams.api_key = this.apiKey;
      }

      const searchResponse = await this.executeWithRateLimit(() =>
        this.client.get('/esearch.fcgi', { params: searchParams })
      );

      const searchData = searchResponse.data;
      const idList = searchData.esearchresult?.idlist || [];
      const totalResults = parseInt(searchData.esearchresult?.count || '0', 10);

      let articles: Array<{
        id: string;
        title: string;
        authors: string[];
        journal: string;
        publication_date: string;
        abstract_url: string;
        doi?: string;
      }> = [];

      if (idList.length > 0) {
        // 获取文章详情（带限流）
        const summaryParams: Record<string, string | number> = {
          db: 'pubmed',
          id: idList.join(','),
          retmode: 'json',
        };

        if (this.apiKey) {
          summaryParams.api_key = this.apiKey;
        }

        const summaryResponse = await this.executeWithRateLimit(() =>
          this.client.get('/esummary.fcgi', { params: summaryParams })
        );

        const summaryData = summaryResponse.data;
        const result = summaryData.result || {};

        articles = idList.map((id: string) => {
          const articleData = result[id] || {};
          
          // 提取作者
          const authors: string[] = [];
          if (articleData.authors) {
            for (const author of articleData.authors) {
              if (author.name) {
                authors.push(author.name);
              }
            }
          }

          // 提取DOI
          let doi = '';
          if (articleData.articleids) {
            for (const idObj of articleData.articleids) {
              if (idObj.idtype === 'doi') {
                doi = idObj.value || '';
                break;
              }
            }
          }

          return {
            id,
            title: articleData.title || '',
            authors,
            journal: articleData.fulljournalname || '',
            publication_date: articleData.pubdate || '',
            abstract_url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
            doi,
          };
        });
      }

      return {
        status: 'success',
        data: {
          query,
          total_results: totalResults,
          date_range: dateRange,
          open_access: openAccess,
          articles,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error searching PubMed: ${message}` };
    }
  }

  /**
   * 搜索并返回标准格式
   */
  async searchAsPages(params: {
    query: string;
    maxResults?: number;
    sort?: 'relevance' | 'date';
    dateRange?: string;
    openAccess?: boolean;
  }): Promise<ICrawledPage[]> {
    const result = await this.search(params);

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.articles.map(article => ({
      url: article.abstract_url,
      title: article.title,
      content: [
        `Authors: ${article.authors.join(', ')}`,
        `Journal: ${article.journal}`,
        `Publication Date: ${article.publication_date}`,
        article.doi ? `DOI: ${article.doi}` : '',
        `PMID: ${article.id}`,
      ].filter(Boolean).join('\n'),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'pubmed',
        pmid: article.id,
        doi: article.doi,
        journal: article.journal,
        publicationDate: article.publication_date,
      },
    }));
  }

  /**
   * 获取文献详情
   */
  async fetchDetails(ids: string[]): Promise<ICrawledPage[]> {
    if (ids.length === 0) return [];

    try {
      const params: Record<string, string | number> = {
        db: 'pubmed',
        id: ids.join(','),
        retmode: 'json',
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get('/esummary.fcgi', { params })
      );
      
      const data = response.data;
      const result = data.result || {};

      return ids.map(id => {
        const article = result[id] || {};
        const content = this.formatArticleContent(article);

        return {
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          title: article.title || 'Unknown Title',
          content,
          metadata: {
            crawledAt: new Date(),
            statusCode: 200,
            contentType: 'application/json',
            links: [],
            source: 'pubmed',
            pmid: id,
          },
        };
      });
    } catch (error) {
      console.error('PubMed fetch details error:', error);
      return [];
    }
  }

  /**
   * 获取文献摘要
   */
  async fetchAbstracts(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};

    try {
      const params: Record<string, string | number> = {
        db: 'pubmed',
        id: ids.join(','),
        rettype: 'abstract',
        retmode: 'text',
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get('/efetch.fcgi', { params })
      );
      
      return { raw: response.data };
    } catch (error) {
      console.error('PubMed fetch abstracts error:', error);
      return {};
    }
  }

  /**
   * 格式化文章内容
   */
  private formatArticleContent(article: Record<string, unknown>): string {
    const parts: string[] = [];

    if (article.title) {
      parts.push(`Title: ${article.title}`);
    }

    if (article.authors && Array.isArray(article.authors)) {
      const authors = article.authors
        .map((a: { name?: string }) => a.name)
        .filter(Boolean)
        .join(', ');
      parts.push(`Authors: ${authors}`);
    }

    if (article.pubdate) {
      parts.push(`Published: ${article.pubdate}`);
    }

    if (article.source) {
      parts.push(`Journal: ${article.source}`);
    }

    if (article.fulljournalname) {
      parts.push(`Full Journal Name: ${article.fulljournalname}`);
    }

    if (article.abstract) {
      parts.push(`Abstract: ${article.abstract}`);
    }

    return parts.join('\n');
  }
}
