import { registry } from '../../../core/registry';
import { GetHospitalNewsToolDefinition, createGetHospitalNewsHandler } from './hospital-news.tool';
import type { HospitalNewsService } from '../../../services/hospital-news/hospital-news.service';

export function registerHospitalNewsTools(services: { hospitalNewsService: HospitalNewsService }) {
  registry.register({
    ...GetHospitalNewsToolDefinition,
    handler: createGetHospitalNewsHandler(services.hospitalNewsService),
  });
}

export * from './hospital-news.tool';
