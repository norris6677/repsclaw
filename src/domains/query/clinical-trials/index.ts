import { registry } from '../../../core/registry';
import { ClinicalTrialsToolDefinition, createClinicalTrialsHandler } from './clinical-trials.tool';

export function registerClinicalTrialsTools() {
  registry.register({
    ...ClinicalTrialsToolDefinition,
    handler: createClinicalTrialsHandler(),
  });
}

export * from './clinical-trials.tool';
