import { registry } from '../../../core/registry';
import {
  SubscribeDoctorToolDefinition,
  createSubscribeDoctorHandler,
  ListDoctorsToolDefinition,
  createListDoctorsHandler,
  UnsubscribeDoctorToolDefinition,
  createUnsubscribeDoctorHandler,
  SetPrimaryDoctorToolDefinition,
  createSetPrimaryDoctorHandler,
  CheckDoctorSubscriptionStatusToolDefinition,
  createCheckDoctorSubscriptionStatusHandler,
} from './doctor-subscription.tool';
import type { DoctorSubscriptionService } from '../../../services/doctor-subscription.service';

export function registerDoctorSubscriptionTools(services: {
  doctorSubscriptionService: DoctorSubscriptionService;
}) {
  registry.register({
    ...SubscribeDoctorToolDefinition,
    handler: createSubscribeDoctorHandler(services.doctorSubscriptionService),
  });

  registry.register({
    ...ListDoctorsToolDefinition,
    handler: createListDoctorsHandler(services.doctorSubscriptionService),
  });

  registry.register({
    ...UnsubscribeDoctorToolDefinition,
    handler: createUnsubscribeDoctorHandler(services.doctorSubscriptionService),
  });

  registry.register({
    ...SetPrimaryDoctorToolDefinition,
    handler: createSetPrimaryDoctorHandler(services.doctorSubscriptionService),
  });

  registry.register({
    ...CheckDoctorSubscriptionStatusToolDefinition,
    handler: createCheckDoctorSubscriptionStatusHandler(services.doctorSubscriptionService),
  });
}

export * from './doctor-subscription.tool';
