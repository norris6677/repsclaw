import { registry } from '../../../core/registry';
import {
  BootstrapCollectionTool,
  createBootstrapCollectionHandler,
  IncrementalCollectionTool,
  createIncrementalCollectionHandler,
  GetCollectionStatusTool,
  createGetCollectionStatusHandler,
  QueryRawSourcesTool,
  createQueryRawSourcesHandler,
  GetCollectionStatsTool,
  createGetCollectionStatsHandler,
  CollectDoctorTool,
  createCollectDoctorHandler,
  CollectDepartmentTool,
  createCollectDepartmentHandler,
  AgentCollectionTool,
  createAgentCollectionHandler,
} from '../../../tools/knowledge-collection.tool';
import type { KnowledgeCollectionService } from '../../../services/knowledge-collection/knowledge-collection.service';
import type { RawSourceManager } from '../../../services/knowledge-collection/raw-source.manager';
import type { ScheduledTaskService } from '../../../services/knowledge-collection/scheduled-task.service';

export interface KnowledgeCollectionServices {
  collectionService: KnowledgeCollectionService;
  rawSourceManager: RawSourceManager;
  taskService?: ScheduledTaskService;
}

export function registerKnowledgeCollectionTools(services: KnowledgeCollectionServices) {
  registry.register({
    ...BootstrapCollectionTool,
    handler: createBootstrapCollectionHandler(services.collectionService),
  });

  registry.register({
    ...IncrementalCollectionTool,
    handler: createIncrementalCollectionHandler(services.collectionService, services.taskService!),
  });

  registry.register({
    ...GetCollectionStatusTool,
    handler: createGetCollectionStatusHandler(services.collectionService),
  });

  registry.register({
    ...QueryRawSourcesTool,
    handler: createQueryRawSourcesHandler(services.rawSourceManager),
  });

  registry.register({
    ...GetCollectionStatsTool,
    handler: createGetCollectionStatsHandler(services.collectionService, services.rawSourceManager),
  });

  registry.register({
    ...CollectDoctorTool,
    handler: createCollectDoctorHandler(services.collectionService),
  });

  registry.register({
    ...CollectDepartmentTool,
    handler: createCollectDepartmentHandler(services.collectionService),
  });

  registry.register({
    ...AgentCollectionTool,
    handler: createAgentCollectionHandler(services.collectionService),
  });
}
