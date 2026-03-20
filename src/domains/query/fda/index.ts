import { registry } from '../../../core/registry';
import { FDAToolDefinition, createFDAHandler } from './fda.tool';
import type { HealthAPIService } from '../../../integrations/api/health-api.service';

export function registerFDATools(services: { healthAPI: HealthAPIService }) {
  registry.register({
    ...FDAToolDefinition,
    handler: createFDAHandler(services.healthAPI),
  });
}

export * from './fda.tool';
