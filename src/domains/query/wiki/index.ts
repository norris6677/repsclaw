/**
 * Wiki Query Domain Registration
 * 注册 Wiki 查询相关工具到 OpenClaw
 */

import { registry } from '../../../core/registry';
import {
  QueryWikiEntityTool,
  createQueryWikiEntityHandler,
  QueryWikiRelationshipTool,
  createQueryWikiRelationshipHandler,
  QueryWikiTrendTool,
  createQueryWikiTrendHandler,
  SaveWikiInsightTool,
  createSaveWikiInsightHandler,
  RunWikiLintTool,
  createRunWikiLintHandler,
} from './wiki-query.tool';
import type { WikiQueryService } from '../../../services/wiki/wiki-query.service';
import type { WikiLintService } from '../../../services/wiki/wiki-lint.service';
import type { WikiManager } from '../../../services/wiki/wiki-manager.service';

export function registerWikiQueryTools(deps: {
  wikiQueryService: WikiQueryService;
  wikiLintService: WikiLintService;
  wikiManager: WikiManager;
}): void {
  registry.register({
    ...QueryWikiEntityTool,
    handler: createQueryWikiEntityHandler(deps.wikiQueryService),
  });

  registry.register({
    ...QueryWikiRelationshipTool,
    handler: createQueryWikiRelationshipHandler(deps.wikiQueryService),
  });

  registry.register({
    ...QueryWikiTrendTool,
    handler: createQueryWikiTrendHandler(deps.wikiQueryService),
  });

  registry.register({
    ...SaveWikiInsightTool,
    handler: createSaveWikiInsightHandler(deps.wikiManager),
  });

  registry.register({
    ...RunWikiLintTool,
    handler: createRunWikiLintHandler(deps.wikiLintService),
  });
}
