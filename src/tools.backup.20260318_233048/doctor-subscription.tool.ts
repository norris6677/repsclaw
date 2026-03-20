import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';
import { DoctorSubscriptionService } from '../services/doctor-subscription.service';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 订阅医生 ==========
export const SubscribeDoctorParametersSchema = z.object({
  hospitalName: z.string().min(1).describe("医院名称 / Hospital name (must be subscribed first)"),
  doctorName: z.string().min(1).describe("医生姓名 / Doctor name"),
  department: z.string().optional().describe("科室（可选）/ Department (optional)"),
  isPrimary: z.boolean().default(false).describe("是否设为主要医生 / Set as primary doctor"),
}).strict();

export type SubscribeDoctorParameters = z.infer<typeof SubscribeDoctorParametersSchema>;
export const SUBSCRIBE_DOCTOR_TOOL_NAME = 'subscribe_doctor';

export const SubscribeDoctorTool = {
  name: SUBSCRIBE_DOCTOR_TOOL_NAME,
  description: "订阅关注的医生 / Subscribe to a doctor. The hospital must be subscribed first using subscribe_hospital.",
  parameters: zodToJsonSchema(SubscribeDoctorParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createSubscribeDoctorHandler(doctorSubscriptionService: DoctorSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(SUBSCRIBE_DOCTOR_TOOL_NAME, args);

    try {
      const params = SubscribeDoctorParametersSchema.parse(args);

      const result = doctorSubscriptionService.subscribe(
        params.hospitalName,
        params.doctorName,
        params.department,
        params.isPrimary
      );

      if (!result.success) {
        return {
          status: 'error',
          error: {
            code: 'SUBSCRIBE_ERROR',
            message: result.error,
          },
        };
      }

      const doctors = doctorSubscriptionService.getDoctors();
      const stats = doctorSubscriptionService.getStats();

      toolLogger.toolResult(SUBSCRIBE_DOCTOR_TOOL_NAME, 'success', {
        hospital: result.subscription!.hospital,
        name: result.subscription!.name,
        isExisting: result.isExisting,
      });

      if (result.isExisting) {
        return {
          status: 'success',
          message: params.isPrimary
            ? `您已订阅 ${result.subscription!.name}（${result.subscription!.hospital}），已更新为主要医生`
            : `您已订阅 ${result.subscription!.name}（${result.subscription!.hospital}），无需重复订阅`,
          data: {
            subscription: result.subscription,
            doctors,
            primary: stats.primary,
            isExisting: true,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      const isPrimary = doctors.length === 1 ? true : params.isPrimary;

      return {
        status: 'success',
        message: isPrimary
          ? `✅ 已订阅 ${result.subscription!.name}（${result.subscription!.hospital}）- 主要医生`
          : `✅ 已订阅 ${result.subscription!.name}（${result.subscription!.hospital}）`,
        data: {
          subscription: result.subscription,
          doctors,
          primary: stats.primary,
        },
        meta: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('Subscribe doctor tool error', error);
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

// ========== 列出已订阅医生 ==========
export const ListDoctorsParametersSchema = z.object({
  hospitalName: z.string().optional().describe("按医院筛选（可选）/ Filter by hospital (optional)"),
}).strict();

export type ListDoctorsParameters = z.infer<typeof ListDoctorsParametersSchema>;
export const LIST_DOCTORS_TOOL_NAME = 'list_subscribed_doctors';

export const ListDoctorsTool = {
  name: LIST_DOCTORS_TOOL_NAME,
  description: "列出已订阅的医生 / List subscribed doctors. Optionally filter by hospital.",
  parameters: zodToJsonSchema(ListDoctorsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createListDoctorsHandler(doctorSubscriptionService: DoctorSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(LIST_DOCTORS_TOOL_NAME, args);

    try {
      // 解析可选参数
      let params: ListDoctorsParameters = {};
      if (args && typeof args === 'object') {
        const parsed = ListDoctorsParametersSchema.safeParse(args);
        if (parsed.success) {
          params = parsed.data;
        }
      }

      let doctors = doctorSubscriptionService.getDoctors();

      // 如果指定了医院，进行筛选
      if (params.hospitalName) {
        doctors = doctors.filter(d =>
          d.hospital.toLowerCase().includes(params.hospitalName!.toLowerCase())
        );
      }

      const stats = doctorSubscriptionService.getStats();

      toolLogger.toolResult(LIST_DOCTORS_TOOL_NAME, 'success', { count: doctors.length });

      if (doctors.length === 0) {
        const message = params.hospitalName
          ? `您在 "${params.hospitalName}" 没有订阅任何医生。使用 "subscribe_doctor" 工具添加订阅。`
          : '您尚未订阅任何医生。使用 "subscribe_doctor" 工具添加订阅。';

        return {
          status: 'success',
          message,
          data: { doctors: [], primary: null, totalCount: stats.total },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      const doctorList = doctors.map(d => {
        const primaryMark = d.isPrimary ? '⭐ ' : '';
        const deptInfo = d.department ? ` [${d.department}]` : '';
        return `${primaryMark}${d.name}${deptInfo} (${d.hospital})`;
      }).join('\n');

      const filterInfo = params.hospitalName ? `（${params.hospitalName}）` : '';

      return {
        status: 'success',
        message: `您订阅了 ${doctors.length} 位医生${filterInfo}：\n${doctorList}`,
        data: {
          doctors,
          primary: stats.primary,
          totalCount: stats.total,
          filteredBy: params.hospitalName || null,
        },
        meta: { timestamp: new Date().toISOString() },
      };
    } catch (error) {
      toolLogger.error('List doctors tool error', error);
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

// ========== 取消订阅医生 ==========
export const UnsubscribeDoctorParametersSchema = z.object({
  hospitalName: z.string().min(1).describe("医院名称 / Hospital name"),
  doctorName: z.string().min(1).describe("医生姓名 / Doctor name"),
}).strict();

export type UnsubscribeDoctorParameters = z.infer<typeof UnsubscribeDoctorParametersSchema>;
export const UNSUBSCRIBE_DOCTOR_TOOL_NAME = 'unsubscribe_doctor';

export const UnsubscribeDoctorTool = {
  name: UNSUBSCRIBE_DOCTOR_TOOL_NAME,
  description: "取消医生订阅 / Unsubscribe from a doctor",
  parameters: zodToJsonSchema(UnsubscribeDoctorParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createUnsubscribeDoctorHandler(doctorSubscriptionService: DoctorSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(UNSUBSCRIBE_DOCTOR_TOOL_NAME, args);

    try {
      const params = UnsubscribeDoctorParametersSchema.parse(args);

      const result = doctorSubscriptionService.unsubscribe(
        params.hospitalName,
        params.doctorName
      );

      if (result.success) {
        const stats = doctorSubscriptionService.getStats();

        toolLogger.toolResult(UNSUBSCRIBE_DOCTOR_TOOL_NAME, 'success', {
          hospital: params.hospitalName,
          name: params.doctorName,
        });

        return {
          status: 'success',
          message: `已取消订阅 ${params.doctorName}（${params.hospitalName}）`,
          data: {
            doctors: doctorSubscriptionService.getDoctors(),
            primary: stats.primary,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: result.error,
          availableDoctors: doctorSubscriptionService.getDoctors().map(d => ({
            name: d.name,
            hospital: d.hospital,
          })),
        },
      };
    } catch (error) {
      toolLogger.error('Unsubscribe doctor tool error', error);
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

// ========== 设置主要医生 ==========
export const SetPrimaryDoctorParametersSchema = z.object({
  hospitalName: z.string().min(1).describe("医院名称 / Hospital name"),
  doctorName: z.string().min(1).describe("医生姓名 / Doctor name"),
}).strict();

export type SetPrimaryDoctorParameters = z.infer<typeof SetPrimaryDoctorParametersSchema>;
export const SET_PRIMARY_DOCTOR_TOOL_NAME = 'set_primary_doctor';

export const SetPrimaryDoctorTool = {
  name: SET_PRIMARY_DOCTOR_TOOL_NAME,
  description: "设置主要医生 / Set primary doctor",
  parameters: zodToJsonSchema(SetPrimaryDoctorParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

export function createSetPrimaryDoctorHandler(doctorSubscriptionService: DoctorSubscriptionService) {
  return async (args: unknown) => {
    toolLogger.toolCall(SET_PRIMARY_DOCTOR_TOOL_NAME, args);

    try {
      const params = SetPrimaryDoctorParametersSchema.parse(args);

      const result = doctorSubscriptionService.setPrimary(
        params.hospitalName,
        params.doctorName
      );

      if (result.success) {
        const stats = doctorSubscriptionService.getStats();

        toolLogger.toolResult(SET_PRIMARY_DOCTOR_TOOL_NAME, 'success', {
          hospital: params.hospitalName,
          name: params.doctorName,
        });

        return {
          status: 'success',
          message: `已将 ${params.doctorName}（${params.hospitalName}）设为主要医生`,
          data: {
            doctors: doctorSubscriptionService.getDoctors(),
            primary: stats.primary,
          },
          meta: { timestamp: new Date().toISOString() },
        };
      }

      return {
        status: 'error',
        error: {
          code: 'NOT_SUBSCRIBED',
          message: result.error,
          availableDoctors: doctorSubscriptionService.getDoctors().map(d => ({
            name: d.name,
            hospital: d.hospital,
          })),
        },
      };
    } catch (error) {
      toolLogger.error('Set primary doctor tool error', error);
      return {
        status: 'error',
        error: {
          code: 'SET_PRIMARY_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

// ========== 检查医生订阅状态 ==========
export const CHECK_DOCTOR_SUBSCRIPTION_STATUS_TOOL_NAME = 'check_doctor_subscription_status';

export const CheckDoctorSubscriptionStatusTool = {
  name: CHECK_DOCTOR_SUBSCRIPTION_STATUS_TOOL_NAME,
  description: "检查医生订阅状态 / Check doctor subscription status",
  parameters: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

export function createCheckDoctorSubscriptionStatusHandler(doctorSubscriptionService: DoctorSubscriptionService) {
  return async () => {
    const stats = doctorSubscriptionService.getStats();
    const isFirstTime = doctorSubscriptionService.isFirstTime();

    return {
      status: 'success',
      data: {
        isFirstTime,
        totalDoctors: stats.total,
        primaryDoctor: stats.primary,
        byHospital: stats.byHospital,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  };
}
