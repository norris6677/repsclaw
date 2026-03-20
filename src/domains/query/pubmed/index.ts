import { registry } from '../../../core/registry';
import { PubMedToolDefinition, createPubMedHandler } from './pubmed.tool';
import type { HealthAPIService } from '../../../integrations/api/health-api.service';

export function registerPubMedTools(services: { healthAPI: HealthAPIService }) {
  registry.register({
    ...PubMedToolDefinition,
    handler: createPubMedHandler(services.healthAPI),
  });
}

export * from './pubmed.tool';
