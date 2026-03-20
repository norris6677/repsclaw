import { registry } from '../../../core/registry';
import { MedRxivToolDefinition, createMedRxivHandler } from './medrxiv.tool';
import type { HealthAPIService } from '../../../integrations/api/health-api.service';

export function registerMedRxivTools(services: { healthAPI: HealthAPIService }) {
  registry.register({
    ...MedRxivToolDefinition,
    handler: createMedRxivHandler(services.healthAPI),
  });
}

export * from './medrxiv.tool';
