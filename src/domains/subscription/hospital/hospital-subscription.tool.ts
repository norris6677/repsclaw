import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../utils/plugin-logger';
import type { HospitalSubscriptionService } from '../../../services/hospital-subscription.service';
import type { ToolDefinition } from '../../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 订阅医院 ==========
export const SubscribeHospitalParametersSchema = z.object({
  name: z.string().min(1).describe("医院名称 / Hospital name"),
  isPrimary: z.boolean().default(false).describe("是否设为主要医院 / Set as primary hospital"),
  department: z.string().optional().describe("科室名称（可选，同时订阅该科室）/ Department name (optional, subscribe to this department as well)"),
}).strict();

export type SubscribeHospitalParameters = z.infer<typeof SubscribeHospitalParametersSchema>;
export const SUBSCRIBE_HOSPITAL_TOOL_NAME = 'subscribe_hospital';

export const SubscribeHospitalToolDefinition = {
  name: SUBSCRIBE_HOSPITAL_TOOL_NAME,
  description: "订阅关注的医院 / Subscribe to a hospital\n\n典型场景：\n- \"我想订阅北京协和医院\"\n- \"帮我关注华山医院心内科\"\n- \"添加医院：复旦大学附属中山医院\"\n\n支持同时订阅科室，订阅后会优先展示该医院相关信息。",
  parameters: zodToJsonSchema(SubscribeHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'hospital',
    triggers: {
      keywords: ['订阅', '关注', '添加医院', '我要'],
      patterns: ['订阅.*医院', '关注.*医院', '添加.*医院'],
    },
    characteristics: {
      isReadOnly: false,
      hasSideEffect: true,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: [],
    },
    resultUsage: {
      fields: {
        'data.hospitals': '已订阅医院列表',
        'data.primary': '当前主要医院',
      },
    },
  },
};

export function createSubscribeHospitalHandler(subscriptionService: HospitalSubscriptionService): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(SUBSCRIBE_HOSPITAL_TOOL_NAME, args);

    try {
      const params = SubscribeHospitalParametersSchema.parse(args);

      const resolved = subscriptionService.resolveHospitalName(params.name);
      const targetName = resolved?.name || params.name;
      const isAlias = resolved?.isAlias || false;

      const isExistingHospital = subscriptionService.isSubscribed(targetName);
      let departmentResult: { success: boolean; isExisting: boolean } | undefined;

      if (isExistingHospital) {
        if (params.isPrimary) {
          subscriptionService.subscribe(targetName, true);
        }

        if (params.department) {
          departmentResult = subscriptionService.subscribeDepartment(targetName, params.department);
        }

        const hospitals = subscriptionService.getHospitals();
        const primary = subscriptionService.getPrimaryHospital();

        toolLogger.toolResult(SUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { name: targetName, existing: true });

        let message = params.isPrimary
          ? `您已订阅 ${targetName}，已更新为主要医院`
          : `您已订阅 ${targetName}，无需重复订阅`;

        if (departmentResult) {
          if (departmentResult.isExisting) {
            message += `，科室 "${params.department}" 已订阅`;
          } else {
            message += `，已订阅科室 "${params.department}"`;
          }
        }

        return {
          status: 'success',
          message,
          data: {
            hospitals,
            primary: primary?.name,
            isExisting: true,
            isAlias,
            departmentResult: departmentResult ? {
              department: params.department,
              isExisting: departmentResult.isExisting,
            } : undefined,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      const subscription = subscriptionService.subscribe(targetName, params.isPrimary);
      const isPrimary = subscriptionService.getHospitals().length === 1 ? true : params.isPrimary;

      if (params.department) {
        departmentResult = subscriptionService.subscribeDepartment(targetName, params.department);
      }

      const hospitals = subscriptionService.getHospitals();

      toolLogger.toolResult(SUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { name: targetName });

      let message = isPrimary
        ? `✅ 已订阅 ${targetName}（主要医院）`
        : `✅ 已订阅 ${targetName}`;

      if (departmentResult?.success) {
        message += `，已订阅科室 "${params.department}"`;
      }

      return {
        status: 'success',
        message,
        data: {
          subscription,
          hospitals,
          primary: subscriptionService.getPrimaryHospital()?.name,
          isAlias,
          departmentResult: departmentResult ? {
            department: params.department,
            isExisting: departmentResult.isExisting,
          } : undefined,
        },
        meta: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('Subscribe hospital tool error', error);
      return {
        status: 'error',
        error: {
          code: 'SUBSCRIBE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 列出已订阅医院 ==========
export const LIST_HOSPITALS_TOOL_NAME = 'list_subscribed_hospitals';

export const ListHospitalsToolDefinition = {
  name: LIST_HOSPITALS_TOOL_NAME,
  description: "列出已订阅的医院 / List subscribed hospitals",
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'hospital',
    triggers: {
      keywords: ['列出', '查看', '我的医院'],
      patterns: ['列出.*医院', '查看.*订阅'],
    },
    characteristics: {
      isReadOnly: true,
      hasSideEffect: false,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: ['list_subscribed_doctors'],
    },
    resultUsage: {
      fields: {
        'data.hospitals': '医院列表',
        'data.primary': '主要医院',
      },
    },
  },
};

export function createListHospitalsHandler(subscriptionService: HospitalSubscriptionService): ToolDefinition['handler'] {
  return async () => {
    toolLogger.toolCall(LIST_HOSPITALS_TOOL_NAME, {});

    try {
      const hospitals = subscriptionService.getHospitals();
      const primary = subscriptionService.getPrimaryHospital();
      const allDepartments = subscriptionService.getAllDepartments();

      toolLogger.toolResult(LIST_HOSPITALS_TOOL_NAME, 'success', { count: hospitals.length });

      if (hospitals.length === 0) {
        return {
          status: 'success',
          message: '您尚未订阅任何医院。使用 "subscribe_hospital" 工具添加订阅。',
          data: { hospitals: [], primary: null, departments: [] },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      const hospitalList = hospitals.map(h => {
        let line = h.isPrimary ? `🏥 ${h.name} (主要)` : `🏥 ${h.name}`;
        if (h.departments && h.departments.length > 0) {
          line += `\n   📋 科室: ${h.departments.join('、')}`;
        }
        return line;
      }).join('\n');

      const totalDepartments = allDepartments.reduce((sum, d) => sum + d.departments.length, 0);

      return {
        status: 'success',
        message: `您订阅了 ${hospitals.length} 家医院，共 ${totalDepartments} 个科室：\n${hospitalList}`,
        data: {
          hospitals,
          primary: primary?.name,
          departments: allDepartments,
          totalDepartments,
        },
        meta: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('List hospitals tool error', error);
      return {
        status: 'error',
        error: {
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 取消订阅 ==========
export const UnsubscribeHospitalParametersSchema = z.object({
  name: z.string().min(1).describe("医院名称 / Hospital name"),
  department: z.string().optional().describe("科室名称（可选，不传则取消该医院所有订阅包括科室）/ Department name (optional, unsubscribe specific department only)"),
}).strict();

export type UnsubscribeHospitalParameters = z.infer<typeof UnsubscribeHospitalParametersSchema>;
export const UNSUBSCRIBE_HOSPITAL_TOOL_NAME = 'unsubscribe_hospital';

export const UnsubscribeHospitalToolDefinition = {
  name: UNSUBSCRIBE_HOSPITAL_TOOL_NAME,
  description: "取消医院订阅 / Unsubscribe from a hospital\n\n可以取消整个医院订阅，或仅取消某个科室",
  parameters: zodToJsonSchema(UnsubscribeHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'hospital',
    triggers: {
      keywords: ['取消', '删除', '退订'],
      patterns: ['取消.*订阅', '删除.*医院'],
    },
    characteristics: {
      isReadOnly: false,
      hasSideEffect: true,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: [],
    },
    resultUsage: {},
  },
};

export function createUnsubscribeHospitalHandler(subscriptionService: HospitalSubscriptionService): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(UNSUBSCRIBE_HOSPITAL_TOOL_NAME, args);

    try {
      const params = UnsubscribeHospitalParametersSchema.parse(args);

      const resolved = subscriptionService.resolveHospitalName(params.name);
      const targetName = resolved?.name || params.name;
      const isAlias = resolved?.isAlias || false;

      if (!subscriptionService.isSubscribed(targetName)) {
        return {
          status: 'error',
          error: {
            code: 'NOT_FOUND',
            message: `未找到 "${params.name}" 的订阅。您当前订阅的医院有：${subscriptionService.getHospitals().map(h => h.name).join('、') || '无'}`,
          },
        };
      }

      if (params.department) {
        const result = subscriptionService.unsubscribeDepartment(targetName, params.department);

        if (result.success) {
          toolLogger.toolResult(UNSUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { hospital: targetName, department: params.department });

          const departments = subscriptionService.getDepartments(targetName);
          const deptMessage = departments && departments.length > 0
            ? `，该医院还有科室：${departments.join('、')}`
            : '，该医院已无订阅科室';

          return {
            status: 'success',
            message: `已取消订阅 ${targetName} 的 "${params.department}" 科室${isAlias ? `（通过别名 "${params.name}"）` : ''}${deptMessage}`,
            data: {
              hospitals: subscriptionService.getHospitals(),
              primary: subscriptionService.getPrimaryHospital()?.name,
              isAlias,
              unsubscribedDepartment: params.department,
              remainingDepartments: departments,
            },
            meta: { timestamp: new Date().toISOString() },
          };
        }

        return {
          status: 'error',
          error: {
            code: 'DEPARTMENT_NOT_FOUND',
            message: `未找到 ${targetName} 的 "${params.department}" 科室订阅。该医院订阅的科室有：${subscriptionService.getDepartments(targetName)?.join('、') || '无'}`,
          },
        };
      }

      const success = subscriptionService.unsubscribe(targetName);

      if (success) {
        toolLogger.toolResult(UNSUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { name: targetName });
        return {
          status: 'success',
          message: `已取消订阅 ${targetName}${isAlias ? `（通过别名 "${params.name}"）` : ''}（包括所有科室）`,
          data: {
            hospitals: subscriptionService.getHospitals(),
            primary: subscriptionService.getPrimaryHospital()?.name,
            isAlias,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: `未找到 ${targetName} 的订阅`,
        },
      };
    } catch (error) {
      toolLogger.error('Unsubscribe hospital tool error', error);
      return {
        status: 'error',
        error: {
          code: 'UNSUBSCRIBE_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 设置主要医院 ==========
export const SetPrimaryHospitalParametersSchema = z.object({
  name: z.string().min(1).describe("医院名称 / Hospital name"),
}).strict();

export type SetPrimaryHospitalParameters = z.infer<typeof SetPrimaryHospitalParametersSchema>;
export const SET_PRIMARY_HOSPITAL_TOOL_NAME = 'set_primary_hospital';

export const SetPrimaryHospitalToolDefinition = {
  name: SET_PRIMARY_HOSPITAL_TOOL_NAME,
  description: "设置主要医院 / Set primary hospital",
  parameters: zodToJsonSchema(SetPrimaryHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'hospital',
    triggers: {
      keywords: ['主要', '默认', 'primary'],
      patterns: ['设置.*主要', '设为.*默认'],
    },
    characteristics: {
      isReadOnly: false,
      hasSideEffect: true,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: [],
    },
    resultUsage: {},
  },
};

export function createSetPrimaryHospitalHandler(subscriptionService: HospitalSubscriptionService): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(SET_PRIMARY_HOSPITAL_TOOL_NAME, args);

    try {
      const params = SetPrimaryHospitalParametersSchema.parse(args);

      toolLogger.debug('SetPrimaryHospital - Input received', {
        inputName: params.name,
        subscribedHospitals: subscriptionService.getHospitals().map(h => h.name),
      });

      const resolved = subscriptionService.resolveHospitalName(params.name);

      toolLogger.debug('SetPrimaryHospital - Name resolution', {
        input: params.name,
        resolved: resolved?.name,
        isAlias: resolved?.isAlias,
        found: !!resolved,
      });

      if (!resolved) {
        return {
          status: 'error',
          error: {
            code: 'NOT_SUBSCRIBED',
            message: `您尚未订阅 "${params.name}"。您当前订阅的医院有：${subscriptionService.getHospitals().map(h => h.name).join('、') || '无'}`,
            debug: {
              input: params.name,
              availableHospitals: subscriptionService.getHospitals().map(h => h.name),
            },
          },
        };
      }

      const targetName = resolved.name;
      const success = subscriptionService.setPrimary(targetName);

      if (success) {
        toolLogger.toolResult(SET_PRIMARY_HOSPITAL_TOOL_NAME, 'success', { name: targetName, isAlias: resolved.isAlias });
        return {
          status: 'success',
          message: `已将 ${targetName}${resolved.isAlias ? `（通过别名 "${params.name}"）` : ''} 设为主要医院`,
          data: {
            hospitals: subscriptionService.getHospitals(),
            primary: targetName,
            isAlias: resolved.isAlias,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'SET_PRIMARY_ERROR',
          message: `设置 ${targetName} 为主要医院失败`,
          debug: {
            input: params.name,
            resolvedName: targetName,
          },
        },
      };
    } catch (error) {
      toolLogger.error('Set primary hospital tool error', error);
      return {
        status: 'error',
        error: {
          code: 'SET_PRIMARY_ERROR',
          message: error instanceof Error ? error.message : String(error),
          debug: {
            args,
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        },
      };
    }
  };
}

// ========== 检查订阅状态 ==========
export const CHECK_SUBSCRIPTION_STATUS_TOOL_NAME = 'check_hospital_subscription_status';

export const CheckSubscriptionStatusToolDefinition = {
  name: CHECK_SUBSCRIPTION_STATUS_TOOL_NAME,
  description: "检查医院订阅状态 / Check hospital subscription status",
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'hospital',
    triggers: {},
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

export function createCheckSubscriptionStatusHandler(subscriptionService: HospitalSubscriptionService): ToolDefinition['handler'] {
  return async () => {
    const stats = subscriptionService.getStats();
    const isFirstTime = subscriptionService.isFirstTime();
    const hasPromptedToday = subscriptionService.hasPromptedToday();
    const allDepartments = subscriptionService.getAllDepartments();

    return {
      status: 'success',
      data: {
        isFirstTime,
        hasPromptedToday,
        totalHospitals: stats.total,
        primaryHospital: stats.primary,
        totalDepartments: stats.totalDepartments,
        needsPrompt: isFirstTime || (!hasPromptedToday && stats.total > 0),
        departmentsByHospital: allDepartments,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  };
}
