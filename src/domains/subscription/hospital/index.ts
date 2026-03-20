import { registry } from '../../../core/registry';
import {
  SubscribeHospitalToolDefinition,
  createSubscribeHospitalHandler,
  ListHospitalsToolDefinition,
  createListHospitalsHandler,
  UnsubscribeHospitalToolDefinition,
  createUnsubscribeHospitalHandler,
  SetPrimaryHospitalToolDefinition,
  createSetPrimaryHospitalHandler,
  CheckSubscriptionStatusToolDefinition,
  createCheckSubscriptionStatusHandler,
} from './hospital-subscription.tool';
import type { HospitalSubscriptionService } from '../../../services/hospital-subscription.service';

export function registerHospitalSubscriptionTools(services: {
  subscriptionService: HospitalSubscriptionService;
}) {
  registry.register({
    ...SubscribeHospitalToolDefinition,
    handler: createSubscribeHospitalHandler(services.subscriptionService),
  });

  registry.register({
    ...ListHospitalsToolDefinition,
    handler: createListHospitalsHandler(services.subscriptionService),
  });

  registry.register({
    ...UnsubscribeHospitalToolDefinition,
    handler: createUnsubscribeHospitalHandler(services.subscriptionService),
  });

  registry.register({
    ...SetPrimaryHospitalToolDefinition,
    handler: createSetPrimaryHospitalHandler(services.subscriptionService),
  });

  registry.register({
    ...CheckSubscriptionStatusToolDefinition,
    handler: createCheckSubscriptionStatusHandler(services.subscriptionService),
  });
}

export * from './hospital-subscription.tool';
