import { z } from 'zod';
import { registry } from '../../core/registry';
import { createSequenceHandler } from '../../core/meta-tools/sequence.tool';
import type { HospitalSubscriptionService } from '../../services/hospital-subscription.service';
import type { DoctorSubscriptionService } from '../../services/doctor-subscription.service';
import type { ToolDefinition } from '../../types/tool.types';

const ParametersSchema = z.object({
  maxNewsPerHospital: z.number().default(3),
  includeDepartments: z.boolean().default(true),
});

export const HospitalNewsDigestWorkflow = {
  name: 'workflow_hospital_news_digest',
  description: `预定义工作流：获取订阅医院新闻并生成摘要

适用场景：
- 用户说"帮我整理一下今天医院的新闻"
- "我的医院有什么新消息"
- 定时每日推送

自动执行：get_subscriptions → get_hospital_news → 生成摘要`,
  parameters: {
    type: 'object',
    properties: {
      maxNewsPerHospital: { type: 'number', default: 3 },
      includeDepartments: { type: 'boolean', default: true },
    },
  },
  metadata: {
    category: 'workflow' as const,
    isWorkflow: true,
    implements: '_sequence',
    triggers: {
      keywords: ['摘要', '整理', '汇总'],
      patterns: ['.*摘要.*新闻', '整理.*消息'],
    },
    characteristics: {
      isReadOnly: true,
      hasSideEffect: false,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: [],
    },
    resultUsage: {},
  },
};

export function registerHospitalNewsDigestWorkflow(
  hospitalService: HospitalSubscriptionService,
  doctorService: DoctorSubscriptionService
) {
  const handler: ToolDefinition['handler'] = async (args, context) => {
    const params = ParametersSchema.parse(args);

    const sequenceHandler = createSequenceHandler(registry);

    return sequenceHandler(
      {
        description: '获取订阅医院新闻并生成摘要',
        steps: [
          {
            tool: 'get_subscriptions',
            params: { type: 'hospitals', detailed: true },
            outputAs: 'subscriptions',
          },
          {
            tool: 'get_hospital_news',
            params: {
              hospitalName: '$subscriptions.data.hospitals[0].name',
              maxResults: params.maxNewsPerHospital,
            },
            outputAs: 'news',
            condition: '$subscriptions.data.hospitals.length > 0',
          },
        ],
      },
      context || registry.createContext()
    );
  };

  registry.register({
    ...HospitalNewsDigestWorkflow,
    handler,
  });
}
