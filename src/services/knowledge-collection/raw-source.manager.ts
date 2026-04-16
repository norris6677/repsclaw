/**
 * Raw Source Manager
 * Layer 1: Raw Sources 存储管理
 * 负责原始资料的持久化、检索、索引管理
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
  RawSourceMetadata,
  CollectionSourceType,
  HospitalCollectionStatus,
} from '../../types/knowledge-collection.types';
import { SOURCES_DIR } from '../../config/data-paths.config';
import { createLogger } from '../../utils/plugin-logger';
import { hashUrl, hashTitle, hashContent, DeduplicationChecker } from '../../utils/deduplication';
import { serializeFrontmatter, parseFrontmatter, sanitizeFilename } from '../../utils/markdown-frontmatter';

const logger = createLogger('REPSCLAW:RAW-SOURCE');

/**
 * 原始资料管理器
 */
export class RawSourceManager {
  private baseDir: string;
  private hospitalsDir: string;
  private dedupChecker: DeduplicationChecker;

  constructor() {
    this.baseDir = SOURCES_DIR;
    this.hospitalsDir = path.join(this.baseDir, 'hospitals');
    this.dedupChecker = new DeduplicationChecker();

    this.ensureDirectories();
    this.loadExistingIndex();
  }

  /**
   * 确保目录结构存在
   */
  private ensureDirectories(): void {
    const dirs = [this.baseDir, this.hospitalsDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info('Created directory', { dir });
      }
    }
  }

  /**
   * 加载已有资料到去重索引
   */
  private loadExistingIndex(): void {
    const hospitals = this.getAllHospitals();
    let count = 0;

    for (const hospital of hospitals) {
      const sources = this.getHospitalSources(hospital);
      this.dedupChecker.addExistingSources(sources);
      count += sources.length;
    }

    logger.info('Loaded existing sources into dedup index', { count });
  }

  /**
   * 获取医院目录路径
   */
  private getHospitalDir(hospitalName: string): string {
    return path.join(this.hospitalsDir, sanitizeFilename(hospitalName));
  }

  /**
   * 获取医院内容目录
   */
  private getHospitalContentsDir(hospitalName: string): string {
    return path.join(this.getHospitalDir(hospitalName), 'contents');
  }

  /**
   * 生成文件路径
   */
  private generateFilePath(
    hospitalName: string,
    sourceType: CollectionSourceType,
    sourceId: string
  ): string {
    const date = new Date().toISOString().split('T')[0];
    const typeShort = sourceType.replace(/_/g, '-');
    const filename = `${date}_${typeShort}_${sourceId}.md`;
    return path.join(this.getHospitalContentsDir(hospitalName), filename);
  }

  /**
   * 检查是否重复
   */
  checkDuplicate(url: string, title: string): ReturnType<DeduplicationChecker['checkDuplicate']> {
    return this.dedupChecker.checkDuplicate(url, title);
  }

  /**
   * 保存原始资料
   */
  saveRawSource(params: {
    sourceType: CollectionSourceType;
    url: string;
    title: string;
    content: string;
    hospitalName: string;
    departments?: string[];
    doctors?: string[];
    publishedAt?: string;
    tags?: string[];
    jobId?: string;
  }): RawSourceMetadata | null {
    const { url, title, hospitalName } = params;

    // 检查重复
    const dupCheck = this.checkDuplicate(url, title);
    if (dupCheck.isDuplicate) {
      logger.debug('Duplicate source detected, skipping', {
        url,
        title,
        duplicateType: dupCheck.duplicateType,
      });
      return null;
    }

    // 计算各种哈希
    const urlHash = hashUrl(url);
    const titleHash = hashTitle(title);
    const contentHash = hashContent(params.content);
    const sourceId = urlHash.slice(0, 16);

    // 确保目录存在
    const contentsDir = this.getHospitalContentsDir(hospitalName);
    if (!fs.existsSync(contentsDir)) {
      fs.mkdirSync(contentsDir, { recursive: true });
    }

    // 生成文件路径
    const filePath = this.generateFilePath(hospitalName, params.sourceType, sourceId);

    // 构建元数据
    const metadata: RawSourceMetadata = {
      id: sourceId,
      sourceType: params.sourceType,
      url,
      title,
      hospitalName,
      departments: params.departments,
      doctors: params.doctors,
      collectedAt: new Date().toISOString(),
      publishedAt: params.publishedAt,
      filePath,
      contentHash,
      urlHash,
      titleHash,
      tags: params.tags,
      jobId: params.jobId,
    };

    // 构建 Markdown 内容
    const markdownContent = this.buildMarkdownContent(metadata, params.content);

    // 写入文件
    try {
      fs.writeFileSync(filePath, markdownContent, 'utf-8');
      logger.info('Saved raw source', { filePath, sourceId, hospitalName });
    } catch (error) {
      logger.error('Failed to save raw source', { filePath, error });
      return null;
    }

    // 更新索引
    this.dedupChecker.addNewSource(metadata);

    // 更新医院索引文件
    this.updateHospitalIndex(hospitalName, metadata);

    return metadata;
  }

  /**
   * 构建 Markdown 内容
   */
  private buildMarkdownContent(metadata: RawSourceMetadata, content: string): string {
    const frontmatter = serializeFrontmatter({
      id: metadata.id,
      source_type: metadata.sourceType,
      hospital: metadata.hospitalName,
      departments: metadata.departments,
      doctors: metadata.doctors,
      collected_at: metadata.collectedAt,
      published_at: metadata.publishedAt,
      url: metadata.url,
      title: metadata.title,
      content_hash: metadata.contentHash,
      url_hash: metadata.urlHash,
      title_hash: metadata.titleHash,
      tags: metadata.tags,
      job_id: metadata.jobId,
    });

    return `${frontmatter}

# ${metadata.title}

> 来源：${metadata.sourceType}
> 采集时间：${new Date(metadata.collectedAt).toLocaleString('zh-CN')}
> 原始链接：[${metadata.url}](${metadata.url})

---

## 原始内容

${content}

---

## 采集元数据

- **资料 ID**：${metadata.id}
- **内容哈希**：${metadata.contentHash.slice(0, 16)}...
- **任务 ID**：${metadata.jobId || 'N/A'}
`;
  }

  /**
   * 更新医院索引文件
   */
  private updateHospitalIndex(hospitalName: string, metadata: RawSourceMetadata): void {
    const hospitalDir = this.getHospitalDir(hospitalName);
    const indexPath = path.join(hospitalDir, 'sources.index.md');

    let indexContent = '';
    if (fs.existsSync(indexPath)) {
      indexContent = fs.readFileSync(indexPath, 'utf-8');
    } else {
      indexContent = `# ${hospitalName} - 原始资料索引\n\n`;
    }

    // 添加新条目
    const date = new Date(metadata.collectedAt).toISOString().split('T')[0];
    const entry = `- [${date}] [${metadata.title}](./contents/${path.basename(metadata.filePath)}) - ${metadata.sourceType}\n`;

    // 在文件末尾添加
    fs.writeFileSync(indexPath, indexContent + entry, 'utf-8');
  }

  /**
   * 获取所有医院列表
   */
  getAllHospitals(): string[] {
    if (!fs.existsSync(this.hospitalsDir)) {
      return [];
    }

    return fs.readdirSync(this.hospitalsDir)
      .filter(name => {
        const stat = fs.statSync(path.join(this.hospitalsDir, name));
        return stat.isDirectory();
      })
      .map(name => name.replace(/_/g, ' '));
  }

  /**
   * 获取医院的所有资料
   */
  getHospitalSources(hospitalName: string): RawSourceMetadata[] {
    const contentsDir = this.getHospitalContentsDir(hospitalName);

    if (!fs.existsSync(contentsDir)) {
      return [];
    }

    const sources: RawSourceMetadata[] = [];
    const files = fs.readdirSync(contentsDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(contentsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseFrontmatter(content);

        sources.push({
          id: frontmatter.id as string,
          sourceType: frontmatter.source_type as CollectionSourceType,
          url: frontmatter.url as string,
          title: frontmatter.title as string,
          hospitalName: frontmatter.hospital as string,
          departments: frontmatter.departments as string[],
          doctors: frontmatter.doctors as string[],
          collectedAt: frontmatter.collected_at as string,
          publishedAt: frontmatter.published_at as string,
          filePath,
          contentHash: frontmatter.content_hash as string,
          urlHash: frontmatter.url_hash as string,
          titleHash: frontmatter.title_hash as string,
          tags: frontmatter.tags as string[],
          jobId: frontmatter.job_id as string,
        });
      } catch (error) {
        logger.warn('Failed to parse source file', { filePath, error });
      }
    }

    return sources.sort((a, b) =>
      new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    );
  }

  /**
   * 获取医院的采集统计
   */
  getHospitalStats(hospitalName: string): HospitalCollectionStatus {
    const sources = this.getHospitalSources(hospitalName);
    const distribution: Record<string, number> = {};

    for (const source of sources) {
      distribution[source.sourceType] = (distribution[source.sourceType] || 0) + 1;
    }

    return {
      hospitalName,
      lastBootstrapAt: sources.length > 0 ? sources[sources.length - 1].collectedAt : undefined,
      lastIncrementalAt: sources.length > 0 ? sources[0].collectedAt : undefined,
      totalSources: sources.length,
      sourceTypeDistribution: distribution,
      isCollecting: false,
    };
  }

  /**
   * 获取所有统计
   */
  getGlobalStats(): {
    totalHospitals: number;
    totalSources: number;
    storageSize: number;
  } {
    const hospitals = this.getAllHospitals();
    let totalSources = 0;
    let storageSize = 0;

    for (const hospital of hospitals) {
      const sources = this.getHospitalSources(hospital);
      totalSources += sources.length;

      for (const source of sources) {
        try {
          const stat = fs.statSync(source.filePath);
          storageSize += stat.size;
        } catch {
          // ignore
        }
      }
    }

    return {
      totalHospitals: hospitals.length,
      totalSources,
      storageSize,
    };
  }

  /**
   * 搜索资料
   */
  searchSources(params: {
    hospitalName?: string;
    sourceType?: CollectionSourceType;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }): RawSourceMetadata[] {
    const { hospitalName, sourceType, keyword, startDate, endDate } = params;

    // 确定搜索范围
    const hospitalsToSearch = hospitalName
      ? [hospitalName]
      : this.getAllHospitals();

    let results: RawSourceMetadata[] = [];

    for (const hospital of hospitalsToSearch) {
      const sources = this.getHospitalSources(hospital);
      results = results.concat(sources);
    }

    // 应用过滤条件
    return results.filter(source => {
      // 源类型过滤
      if (sourceType && source.sourceType !== sourceType) {
        return false;
      }

      // 关键词过滤（标题和URL）
      if (keyword) {
        const searchText = `${source.title} ${source.url}`.toLowerCase();
        if (!searchText.includes(keyword.toLowerCase())) {
          return false;
        }
      }

      // 日期范围过滤
      if (startDate || endDate) {
        const collectedDate = new Date(source.collectedAt);

        if (startDate) {
          const start = new Date(startDate);
          if (collectedDate < start) return false;
        }

        if (endDate) {
          const end = new Date(endDate);
          if (collectedDate > end) return false;
        }
      }

      return true;
    });
  }

  /**
   * 删除资料
   */
  deleteSource(sourceId: string, hospitalName: string): boolean {
    const sources = this.getHospitalSources(hospitalName);
    const source = sources.find(s => s.id === sourceId);

    if (!source) {
      return false;
    }

    try {
      fs.unlinkSync(source.filePath);
      logger.info('Deleted source', { sourceId, filePath: source.filePath });
      return true;
    } catch (error) {
      logger.error('Failed to delete source', { sourceId, error });
      return false;
    }
  }

  /**
   * 获取资料内容
   */
  getSourceContent(sourceId: string, hospitalName: string): { metadata: RawSourceMetadata; content: string } | null {
    const sources = this.getHospitalSources(hospitalName);
    const source = sources.find(s => s.id === sourceId);

    if (!source) {
      return null;
    }

    try {
      const fullContent = fs.readFileSync(source.filePath, 'utf-8');
      const { body } = parseFrontmatter(fullContent);
      return { metadata: source, content: body };
    } catch (error) {
      logger.error('Failed to read source content', { sourceId, error });
      return null;
    }
  }
}

// 导出单例
export const rawSourceManager = new RawSourceManager();
