/**
 * Repsclaw - OpenClaw Healthcare Plugin
 * 
 * 一个为 OpenClaw 提供的医疗数据集成插件，包含以下 API：
 * - FDA Drug Information
 * - PubMed Research
 * - Clinical Trials
 * - Medical Terminology (ICD-10)
 * - medRxiv Search
 * - NCBI Bookshelf Search
 * - RAG (检索增强生成)
 * - 合规性检查
 * - 网络爬虫
 */

// 导出 OpenClaw 插件（默认导出）
export { default } from './plugin';
export { RepsclawPlugin } from './plugin';

// 导出类型
export * from './types';

// 导出核心功能
export * from './core';

// 导出服务
export * from './services';

// 导出集成（包括所有医疗 API）
export * from './integrations';
