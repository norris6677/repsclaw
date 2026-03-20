import { registry } from '../../../core/registry';
import { ICD10ToolDefinition, createICD10Handler } from './icd10.tool';
import type { HealthAPIService } from '../../../integrations/api/health-api.service';

export function registerICD10Tools(services: { healthAPI: HealthAPIService }) {
  registry.register({
    ...ICD10ToolDefinition,
    handler: createICD10Handler(services.healthAPI),
  });
}

export * from './icd10.tool';
