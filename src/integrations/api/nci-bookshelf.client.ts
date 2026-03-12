import axios, { AxiosInstance } from 'axios';
import { IExternalAPIConfig, ICrawledPage } from '../../types';
import { CombinedRateLimiter } from '../../utils/rate-limiter';

/**
 * NCBI Bookshelf API 客户端
 * 用于搜索 NCBI Bookshelf 中的医学书籍和文献
 * 
 * 默认限流：3请求/秒，突发5请求
 * 与 PubMed 共用 NCBI E-utilities API，遵循相同的限流策略
 */
export class NciBookshelfClient {
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
    // 与 PubMed 相同的策略：无 API key 时 3/秒，有 API key 时 10/秒
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
   * 搜索 NCBI Bookshelf
   */
  async search(params: {
    query: string;
    maxResults?: number;
  }): Promise<{
    status: 'success' | 'error';
    data?: {
      query: string;
      total_results: number;
      books: Array<{
        id: string;
        title: string;
        authors: string[];
        publication_date: string;
        url: string;
      }>;
    };
    error_message?: string;
  }> {
    const { query, maxResults = 10 } = params;

    if (!query) {
      return { status: 'error', error_message: 'Search query is required' };
    }

    const validMaxResults = Math.min(Math.max(maxResults, 1), 100);

    try {
      // 第一步：搜索获取文档ID
      const searchParams: Record<string, string | number> = {
        db: 'books',
        term: query,
        retmax: validMaxResults,
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

      let books: Array<{
        id: string;
        title: string;
        authors: string[];
        publication_date: string;
        url: string;
      }> = [];

      if (idList.length > 0) {
        // 第二步：获取文档详情
        const summaryParams: Record<string, string | number> = {
          db: 'books',
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

        books = idList.map((id: string) => {
          const bookData = result[id] || {};
          const authors = bookData.authors 
            ? bookData.authors.map((a: { name?: string }) => a.name).filter(Boolean)
            : [];

          return {
            id,
            title: bookData.title || '',
            authors,
            publication_date: bookData.pubdate || '',
            url: `https://www.ncbi.nlm.nih.gov/books/${id}/`,
          };
        });
      }

      return {
        status: 'success',
        data: {
          query,
          total_results: totalResults,
          books,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error searching NCBI Bookshelf: ${message}` };
    }
  }

  /**
   * 搜索并返回标准格式
   */
  async searchAsPages(params: {
    query: string;
    maxResults?: number;
  }): Promise<ICrawledPage[]> {
    const { query, maxResults = 10 } = params;

    const result = await this.search({ query, maxResults });

    if (result.status === 'error' || !result.data) {
      return [];
    }

    return result.data.books.map(book => ({
      url: book.url,
      title: book.title,
      content: [
        `Authors: ${book.authors.join(', ')}`,
        `Publication Date: ${book.publication_date}`,
        `Book ID: ${book.id}`,
      ].join('\n'),
      metadata: {
        crawledAt: new Date(),
        statusCode: 200,
        contentType: 'application/json',
        links: [],
        source: 'ncbi_bookshelf',
        bookId: book.id,
        publicationDate: book.publication_date,
      },
    }));
  }

  /**
   * 获取书籍详细信息
   */
  async getBookDetails(bookId: string): Promise<{
    status: 'success' | 'error';
    data?: {
      id: string;
      title: string;
      authors: string[];
      publication_date: string;
      url: string;
      abstract?: string;
      publisher?: string;
    };
    error_message?: string;
  }> {
    try {
      const params: Record<string, string | number> = {
        db: 'books',
        id: bookId,
        retmode: 'json',
      };

      if (this.apiKey) {
        params.api_key = this.apiKey;
      }

      const response = await this.executeWithRateLimit(() =>
        this.client.get('/esummary.fcgi', { params })
      );
      
      const data = response.data;
      const bookData = data.result?.[bookId];

      if (!bookData) {
        return { status: 'error', error_message: `Book ${bookId} not found` };
      }

      const authors = bookData.authors 
        ? bookData.authors.map((a: { name?: string }) => a.name).filter(Boolean)
        : [];

      return {
        status: 'success',
        data: {
          id: bookId,
          title: bookData.title || '',
          authors,
          publication_date: bookData.pubdate || '',
          url: `https://www.ncbi.nlm.nih.gov/books/${bookId}/`,
          abstract: bookData.abstract || '',
          publisher: bookData.publisher || '',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error fetching book details: ${message}` };
    }
  }

  /**
   * 获取相关书籍
   */
  async getRelatedBooks(bookId: string, maxResults = 5): Promise<{
    status: 'success' | 'error';
    data?: {
      book_id: string;
      related_books: Array<{
        id: string;
        title: string;
        authors: string[];
        url: string;
      }>;
    };
    error_message?: string;
  }> {
    try {
      // 首先获取当前书籍的详情
      const bookDetails = await this.getBookDetails(bookId);
      
      if (bookDetails.status === 'error') {
        return { status: 'error', error_message: bookDetails.error_message };
      }

      // 使用书籍标题的关键词搜索相关书籍
      const title = bookDetails.data?.title || '';
      const keywords = title.split(' ').slice(0, 3).join(' ');
      
      const searchResult = await this.search({ query: keywords, maxResults: maxResults + 1 });
      
      if (searchResult.status === 'error') {
        return { status: 'error', error_message: searchResult.error_message };
      }

      // 过滤掉当前书籍
      const relatedBooks = (searchResult.data?.books || [])
        .filter(book => book.id !== bookId)
        .slice(0, maxResults);

      return {
        status: 'success',
        data: {
          book_id: bookId,
          related_books: relatedBooks,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'error', error_message: `Error fetching related books: ${message}` };
    }
  }
}
