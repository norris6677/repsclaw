import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../utils/plugin-logger';
import { HospitalSubscriptionService } from '../services/hospital-subscription.service';
import { DoctorSubscriptionService } from '../services/doctor-subscription.service';

const toolLogger = createLogger('REPSCLAW:TOOL');

// ========== 统一订阅查询工具 ==========
export const GetSubscriptionsParametersSchema = z.object({
  type: z.enum(['all', 'hospitals', 'departments', 'doctors'])
    .default('all')
    .describe("查询类型：all=全部, hospitals=仅医院, departments=仅科室, doctors=仅医生 / Query type"),
  hospitalName: z.string().optional()
    .describe("医院名称筛选（可选，支持别名）/ Filter by hospital name (optional, supports alias)"),
  detailed: z.boolean().default(true)
    .describe("是否返回详细信息 / Return detailed information"),
}).strict();

export type GetSubscriptionsParameters = z.infer<typeof GetSubscriptionsParametersSchema>;
export const GET_SUBSCRIPTIONS_TOOL_NAME = 'get_subscriptions';

export const GetSubscriptionsTool = {
  name: GET_SUBSCRIPTIONS_TOOL_NAME,
  description: "查询所有订阅信息 / Query all subscription information including hospitals, departments, and doctors",
  parameters: zodToJsonSchema(GetSubscriptionsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
};

interface SubscriptionResult {
  hospitals: Array<{
    name: string;
    subscribedAt: string;
    isPrimary: boolean;
    departments?: string[];
  }>;
  doctors: Array<{
    name: string;
    hospital: string;
    department?: string;
    subscribedAt: string;
    isPrimary: boolean;
  }>;
  stats: {
    totalHospitals: number;
    totalDepartments: number;
    totalDoctors: number;
    primaryHospital: string | null;
    primaryDoctor: string | null;
  };
}

export function createGetSubscriptionsHandler(
  hospitalService: HospitalSubscriptionService,
  doctorService: DoctorSubscriptionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall(GET_SUBSCRIPTIONS_TOOL_NAME, args);

    try {
      const params = GetSubscriptionsParametersSchema.parse(args);

      // 解析医院名称（如果提供了）
      let targetHospital: string | null = null;
      let isAlias = false;

      if (params.hospitalName) {
        const resolved = hospitalService.resolveHospitalName(params.hospitalName);
        if (resolved) {
          targetHospital = resolved.name;
          isAlias = resolved.isAlias;
        } else {
          // 未找到匹配的医院
          return {
            status: 'success',
            message: `未找到 "${params.hospitalName}" 的订阅`,
            data: {
              hospitals: [],
              doctors: [],
              stats: {
                totalHospitals: 0,
                totalDepartments: 0,
                totalDoctors: 0,
                primaryHospital: null,
                primaryDoctor: null,
              },
            },
            meta: { timestamp: new Date().toISOString() },
          };
        }
      }

      // 构建结果
      const result: SubscriptionResult = {
        hospitals: [],
        doctors: [],
        stats: {
          totalHospitals: 0,
          totalDepartments: 0,
          totalDoctors: 0,
          primaryHospital: null,
          primaryDoctor: null,
        },
      };

      // 查询医院信息
      if (params.type === 'all' || params.type === 'hospitals' || params.type === 'departments') {
        const allHospitals = hospitalService.getHospitals();

        if (targetHospital) {
          // 筛选特定医院
          const hospital = allHospitals.find(
            h => h.name.toLowerCase() === targetHospital!.toLowerCase()
          );
          if (hospital) {
            // 如果只看科室，只返回有科室的医院
            if (params.type === 'departments' && (!hospital.departments || hospital.departments.length === 0)) {
              // 跳过没有科室的医院
            } else {
              result.hospitals = [hospital];
            }
          }
        } else {
          // 返回所有医院（如果是departments类型，只返回有科室的）
          if (params.type === 'departments') {
            result.hospitals = allHospitals.filter(
              h => h.departments && h.departments.length > 0
            );
          } else {
            result.hospitals = allHospitals;
          }
        }

        // 统计
        result.stats.totalHospitals = result.hospitals.length;
        result.stats.totalDepartments = result.hospitals.reduce(
          (sum, h) => sum + (h.departments?.length || 0),
          0
        );
        result.stats.primaryHospital = hospitalService.getPrimaryHospital()?.name || null;
      }

      // 查询医生信息
      if (params.type === 'all' || params.type === 'doctors') {
        let doctors = doctorService.getDoctors();

        if (targetHospital) {
          // 筛选特定医院的医生
          doctors = doctors.filter(
            d => d.hospital.toLowerCase() === targetHospital!.toLowerCase()
          );
        }

        result.doctors = doctors;
        result.stats.totalDoctors = doctors.length;
        result.stats.primaryDoctor = doctorService.getPrimaryDoctor()?.name || null;
      }

      // 构建返回消息
      const message = buildMessage(params.type, result, targetHospital, isAlias);

      toolLogger.toolResult(GET_SUBSCRIPTIONS_TOOL_NAME, 'success', {
        hospitalCount: result.hospitals.length,
        doctorCount: result.doctors.length,
      });

      return {
        status: 'success',
        message,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          queryType: params.type,
          filterHospital: targetHospital,
          isAlias,
        },
      };
    } catch (error) {
      toolLogger.error('Get subscriptions tool error', error);
      return {
        status: 'error',
        error: {
          code: 'QUERY_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/**
 * 构建返回消息
 */
function buildMessage(
  type: string,
  result: SubscriptionResult,
  filterHospital?: string | null,
  isAlias?: boolean
): string {
  const hospitalSuffix = filterHospital
    ? `（${filterHospital}${isAlias ? ' - 通过别名匹配' : ''}）`
    : '';

  // 空结果
  if (result.hospitals.length === 0 && result.doctors.length === 0) {
    if (filterHospital) {
      return `未找到 "${filterHospital}" 的订阅信息`;
    }
    return '您尚未订阅任何医院或医生。使用 subscribe_hospital 或 subscribe_doctor 工具添加订阅。';
  }

  const lines: string[] = [];

  // 医院信息
  if (type === 'all' || type === 'hospitals' || type === 'departments') {
    if (result.hospitals.length > 0) {
      lines.push(`🏥 医院订阅${hospitalSuffix}（共 ${result.hospitals.length} 家）：`);

      result.hospitals.forEach(h => {
        let line = h.isPrimary ? `  ⭐ ${h.name} (主要)` : `  • ${h.name}`;
        if (h.departments && h.departments.length > 0) {
          line += `\n    📋 科室: ${h.departments.join('、')}`;
        }
        lines.push(line);
      });
    } else if (type === 'departments') {
      lines.push(`📋 没有找到订阅的科室${hospitalSuffix}`);
    }
  }

  // 医生信息
  if (type === 'all' || type === 'doctors') {
    if (result.doctors.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`👨‍⚕️ 医生订阅${hospitalSuffix}（共 ${result.doctors.length} 位）：`);

      result.doctors.forEach(d => {
        let line = d.isPrimary ? `  ⭐ ${d.name} (主要)` : `  • ${d.name}`;
        line += ` - ${d.hospital}`;
        if (d.department) {
          line += ` (${d.department})`;
        }
        lines.push(line);
      });
    } else if (type === 'doctors') {
      if (lines.length > 0) lines.push('');
      lines.push(`👨‍⚕️ 没有找到订阅的医生${hospitalSuffix}`);
    }
  }

  // 统计信息
  if (type === 'all') {
    lines.push('');
    lines.push('📊 订阅统计：');
    lines.push(`  • 医院: ${result.stats.totalHospitals} 家`);
    if (result.stats.totalDepartments > 0) {
      lines.push(`  • 科室: ${result.stats.totalDepartments} 个`);
    }
    lines.push(`  • 医生: ${result.stats.totalDoctors} 位`);
    if (result.stats.primaryHospital) {
      lines.push(`  • 主要医院: ${result.stats.primaryHospital}`);
    }
    if (result.stats.primaryDoctor) {
      lines.push(`  • 主要医生: ${result.stats.primaryDoctor}`);
    }
  }

  return lines.join('\n');
}

// ========== 向后兼容的旧工具包装器 ==========

/**
 * 创建兼容旧 list_subscribed_hospitals 的 handler
 */
export function createListHospitalsCompatHandler(
  hospitalService: HospitalSubscriptionService,
  doctorService: DoctorSubscriptionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall('list_subscribed_hospitals (compat)', args);

    // 调用新工具，type=hospitals
    const handler = createGetSubscriptionsHandler(hospitalService, doctorService);
    return handler({ type: 'hospitals', detailed: true });
  };
}

/**
 * 创建兼容旧 list_subscribed_doctors 的 handler
 */
export function createListDoctorsCompatHandler(
  hospitalService: HospitalSubscriptionService,
  doctorService: DoctorSubscriptionService
) {
  return async (args: unknown) => {
    toolLogger.toolCall('list_subscribed_doctors (compat)', args);

    const params = args as { hospitalName?: string };

    // 调用新工具，type=doctors
    const handler = createGetSubscriptionsHandler(hospitalService, doctorService);
    return handler({
      type: 'doctors',
      hospitalName: params?.hospitalName,
      detailed: true,
    });
  };
}
