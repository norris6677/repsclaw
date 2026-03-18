// 医院全网消息服务导出
// 注意：已迁移到 Crawlee 爬虫框架，提供更强大的反爬能力

export { HospitalNewsService } from './hospital-news.service';

// Crawlee 版本（推荐）- 更强的反爬能力
export { HospitalSelfNewsClient } from './hospital-self-news.crawlee.client';
export { OfficialNewsClient } from './official-news.crawlee.client';
export { MainstreamNewsClient, IdmayiNewsClient } from './mainstream-news.client';

// 原始 axios 版本（保留用于参考）
// export { HospitalSelfNewsClient as HospitalSelfNewsClientLegacy } from './hospital-self-news.client';
// export { OfficialNewsClient as OfficialNewsClientLegacy } from './official-news.client';
