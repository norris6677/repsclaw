/**
 * CLI Service容器
 * 管理所有Service实例的生命周期
 */

import { HealthAPIService } from '../../integrations/api/health-api.service';
import { HospitalSubscriptionService } from '../../services/hospital-subscription.service';
import { DoctorSubscriptionService } from '../../services/doctor-subscription.service';
import { HospitalNewsService } from '../../services/hospital-news/hospital-news.service';
import { createLogger } from '../../utils/plugin-logger';

const logger = createLogger('REPSCLAW:CLI');

export interface ServiceContainer {
  healthAPI: HealthAPIService;
  hospitalSubscription: HospitalSubscriptionService;
  doctorSubscription: DoctorSubscriptionService;
  hospitalNews: HospitalNewsService;
}

let container: ServiceContainer | null = null;

export function initializeServices(): ServiceContainer {
  if (container) {
    return container;
  }

  logger.info('Initializing CLI services...');

  const healthAPI = new HealthAPIService({
    fda: { apiKey: process.env.FDA_API_KEY },
    pubmed: { apiKey: process.env.PUBMED_API_KEY || process.env.NCBI_API_KEY },
    nciBookshelf: { apiKey: process.env.NCBI_API_KEY },
  });

  const hospitalSubscription = new HospitalSubscriptionService();
  const doctorSubscription = new DoctorSubscriptionService(hospitalSubscription);
  const hospitalNews = new HospitalNewsService();

  container = {
    healthAPI,
    hospitalSubscription,
    doctorSubscription,
    hospitalNews,
  };

  logger.info('CLI services initialized');
  return container;
}

export function getServices(): ServiceContainer {
  if (!container) {
    return initializeServices();
  }
  return container;
}

export function resetServices(): void {
  container = null;
}
