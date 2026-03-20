import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';
import { HospitalSubscriptionService } from '../services/hospital-subscription.service';
import { HospitalNameResolver } from '../utils/hospital-name-resolver';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 订阅医院 ==========
export const SubscribeHospitalParametersSchema = z.object({
  name: z.string().min(1).describe("医院名称 / Hospital name"),
  isPrimary: z.boolean().default(false).describe("是否设为主要医院 / Set as primary hospital"),
  department: z.string().optional().describe("科室名称（可选，同时订阅该科室）/ Department name (optional, subscribe to this department as well)"),
}).strict();

export type SubscribeHospitalParameters = z.infer<typeof SubscribeHospitalParametersSchema>;
export const SUBSCRIBE_HOSPITAL_TOOL_NAME = 'subscribe_hospital';

export const SubscribeHospitalTool = {
  name: SUBSCRIBE_HOSPITAL_TOOL_NAME,
  description: "订阅关注的医院 / Subscribe to a hospital",
  parameters: zodToJsonSchema(SubscribeHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createSubscribeHospitalHandler(subscriptionService: HospitalSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(SUBSCRIBE_HOSPITAL_TOOL_NAME, args);

    try {
      const params = SubscribeHospitalParametersSchema.parse(args);

      // 尝试解析医院名称（支持别名）
      const resolved = subscriptionService.resolveHospitalName(params.name);
      const targetName = resolved?.name || params.name;
      const isAlias = resolved?.isAlias || false;

      const isExistingHospital = subscriptionService.isSubscribed(targetName);
      let departmentResult: { success: boolean; isExisting: boolean } | undefined;

      // 检查是否已订阅
      if (isExistingHospital) {
        // 更新为主要医院（如果需要）
        if (params.isPrimary) {
          subscriptionService.subscribe(targetName, true);
        }

        // 如果指定了科室，订阅科室
        if (params.department) {
          departmentResult = subscriptionService.subscribeDepartment(targetName, params.department);
        }

        const hospitals = subscriptionService.getHospitals();
        const primary = subscriptionService.getPrimaryHospital();

        toolLogger.toolResult(SUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { name: targetName, existing: true });

        // 构建返回消息
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

      // 新订阅医院
      const subscription = subscriptionService.subscribe(targetName, params.isPrimary);
      const isPrimary = subscriptionService.getHospitals().length === 1 ? true : params.isPrimary;

      // 如果指定了科室，订阅科室
      if (params.department) {
        departmentResult = subscriptionService.subscribeDepartment(targetName, params.department);
      }

      const hospitals = subscriptionService.getHospitals();

      toolLogger.toolResult(SUBSCRIBE_HOSPITAL_TOOL_NAME, 'success', { name: targetName });

      // 构建返回消息
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

export const ListHospitalsTool = {
  name: LIST_HOSPITALS_TOOL_NAME,
  description: "列出已订阅的医院 / List subscribed hospitals",
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

export function createListHospitalsHandler(subscriptionService: HospitalSubscriptionService) {
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

      // 构建医院列表，包含科室信息
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

export const UnsubscribeHospitalTool = {
  name: UNSUBSCRIBE_HOSPITAL_TOOL_NAME,
  description: "取消医院订阅 / Unsubscribe from a hospital",
  parameters: zodToJsonSchema(UnsubscribeHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createUnsubscribeHospitalHandler(subscriptionService: HospitalSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(UNSUBSCRIBE_HOSPITAL_TOOL_NAME, args);

    try {
      const params = UnsubscribeHospitalParametersSchema.parse(args);

      // 尝试解析医院名称（支持别名）
      const resolved = subscriptionService.resolveHospitalName(params.name);
      const targetName = resolved?.name || params.name;
      const isAlias = resolved?.isAlias || false;

      // 检查医院是否已订阅
      if (!subscriptionService.isSubscribed(targetName)) {
        return {
          status: 'error',
          error: {
            code: 'NOT_FOUND',
            message: `未找到 "${params.name}" 的订阅。您当前订阅的医院有：${subscriptionService.getHospitals().map(h => h.name).join('、') || '无'}`,
          },
        };
      }

      // 如果指定了科室，只取消科室订阅
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

      // 取消整个医院订阅（包括所有科室）
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

export const SetPrimaryHospitalTool = {
  name: SET_PRIMARY_HOSPITAL_TOOL_NAME,
  description: "设置主要医院 / Set primary hospital",
  parameters: zodToJsonSchema(SetPrimaryHospitalParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createSetPrimaryHospitalHandler(subscriptionService: HospitalSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(SET_PRIMARY_HOSPITAL_TOOL_NAME, args);

    try {
      const params = SetPrimaryHospitalParametersSchema.parse(args);

      // 调试日志：记录输入和当前订阅列表
      toolLogger.debug('SetPrimaryHospital - Input received', {
        inputName: params.name,
        subscribedHospitals: subscriptionService.getHospitals().map(h => h.name),
      });

      // 尝试解析医院名称（支持别名）
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

export const CheckSubscriptionStatusTool = {
  name: CHECK_SUBSCRIPTION_STATUS_TOOL_NAME,
  description: "检查医院订阅状态 / Check hospital subscription status",
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

export function createCheckSubscriptionStatusHandler(subscriptionService: HospitalSubscriptionService) {
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
