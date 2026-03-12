import {
  IEmbeddingConfig,
  IVectorDocument,
  ISearchResult,
  IRAGQuery,
  IRAGResponse,
} from '../types';

/**
 * RAG (Retrieval-Augmented Generation) 服务
 * 负责向量存储、检索和上下文构建
 */
export class RAGService {
  constructor(
    private embeddingConfig: IEmbeddingConfig,
    private vectorStore: IVectorStore
  ) {}

  /**
   * 索引文档
   */
  async indexDocument(doc: IVectorDocument): Promise<void> {
    if (!doc.embedding) {
      doc.embedding = await this.generateEmbedding(doc.content);
    }
    await this.vectorStore.upsert(doc);
  }

  /**
   * 批量索引文档
   */
  async indexDocuments(docs: IVectorDocument[]): Promise<void> {
    const docsWithEmbeddings = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        embedding: doc.embedding || (await this.generateEmbedding(doc.content)),
      }))
    );
    await this.vectorStore.upsertBatch(docsWithEmbeddings);
  }

  /**
   * 执行 RAG 查询
   */
  async query(ragQuery: IRAGQuery): Promise<IRAGResponse> {
    // 生成查询向量
    const queryEmbedding = await this.generateEmbedding(ragQuery.query);

    // 向量检索
    const results = await this.vectorStore.search({
      vector: queryEmbedding,
      topK: ragQuery.topK || 5,
      filters: ragQuery.filters,
      minScore: ragQuery.minScore || 0.7,
    });

    // 构建上下文
    const context = this.buildContext(results);
    const sources = results.map((r) => r.document.id);

    return {
      results,
      context,
      sources,
    };
  }

  /**
   * 删除文档
   */
  async deleteDocument(id: string): Promise<void> {
    await this.vectorStore.delete(id);
  }

  /**
   * 生成文本嵌入向量
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: 集成实际的嵌入模型 (OpenAI, Local Model, etc.)
    // 这里返回模拟数据
    const dimensions = this.embeddingConfig.dimensions;
    return Array.from({ length: dimensions }, () => Math.random() - 0.5);
  }

  /**
   * 构建检索上下文
   */
  private buildContext(results: ISearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    return results
      .map((r, index) => `[${index + 1}] ${r.document.content}`)
      .join('\n\n');
  }
}

/**
 * 向量存储接口
 */
export interface IVectorStore {
  upsert(doc: IVectorDocument): Promise<void>;
  upsertBatch(docs: IVectorDocument[]): Promise<void>;
  search(params: {
    vector: number[];
    topK: number;
    filters?: Record<string, unknown>;
    minScore?: number;
  }): Promise<ISearchResult[]>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<IVectorDocument | null>;
}
