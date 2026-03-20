import { registry } from '../../core/registry';
import {
  GetSubscriptionsToolDefinition,
  createGetSubscriptionsHandler,
} from './subscription-query.tool';
import { registerHospitalSubscriptionTools } from './hospital';
import { registerDoctorSubscriptionTools } from './doctor';
import type { HospitalSubscriptionService } from '../../services/hospital-subscription.service';
import type { DoctorSubscriptionService } from '../../services/doctor-subscription.service';

export interface SubscriptionServices {
  subscriptionService: HospitalSubscriptionService;
  doctorSubscriptionService: DoctorSubscriptionService;
}

export function registerAllSubscriptionTools(services: SubscriptionServices) {
  // 注册医院订阅工具
  registerHospitalSubscriptionTools({
    subscriptionService: services.subscriptionService,
  });

  // 注册医生订阅工具
  registerDoctorSubscriptionTools({
    doctorSubscriptionService: services.doctorSubscriptionService,
  });

  // 注册统一查询工具
  registry.register({
    ...GetSubscriptionsToolDefinition,
    handler: createGetSubscriptionsHandler(
      services.subscriptionService,
      services.doctorSubscriptionService
    ),
  });
}

export * from './hospital';
export * from './doctor';
export * from './subscription-query.tool';
