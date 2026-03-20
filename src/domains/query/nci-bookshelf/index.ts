import { registry } from '../../../core/registry';
import { NCIBookshelfToolDefinition, createNCIBookshelfHandler } from './nci-bookshelf.tool';
import type { HealthAPIService } from '../../../integrations/api/health-api.service';

export function registerNCIBookshelfTools(services: { healthAPI: HealthAPIService }) {
  registry.register({
    ...NCIBookshelfToolDefinition,
    handler: createNCIBookshelfHandler(services.healthAPI),
  });
}

export * from './nci-bookshelf.tool';
