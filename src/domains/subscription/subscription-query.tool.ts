import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../utils/plugin-logger';
import type { HospitalSubscriptionService } from '../../services/hospital-subscription.service';
import type { DoctorSubscriptionService } from '../../services/doctor-subscription.service';
import type { ToolDefinition } from '../../types/tool.types';

const toolLogger = createLogger('REPSCLAW:TOOL');

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

export const GetSubscriptionsToolDefinition = {
  name: GET_SUBSCRIPTIONS_TOOL_NAME,
  description: `查询所有订阅信息 / Query all subscription information including hospitals, departments, and doctors

典型场景：
- "查看我订阅的所有内容"
- "列出我关注的医院和医生"
- "查询协和医院的订阅情况"

常用组合：
- 后可接 get_hospital_news：获取订阅医院的新闻
- 可与 list_subscribed_hospitals/list_subscribed_doctors 并行使用`,
  parameters: zodToJsonSchema(GetSubscriptionsParametersSchema) as {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  },
  metadata: {
    category: 'subscription' as const,
    domain: 'query',
    triggers: {
      keywords: ['订阅', '关注', '我的医院', '我的医生', '列出'],
      patterns: ['查看.*订阅', '列出.*关注', '我的.*订阅'],
    },
    characteristics: {
      isReadOnly: true,
      hasSideEffect: false,
    },
    composition: {
      before: [],
      after: [],
      parallelWith: ['list_subscribed_hospitals', 'list_subscribed_doctors'],
    },
    resultUsage: {
      fields: {
        'data.hospitals': '医院订阅列表',
        'data.doctors': '医生订阅列表',
        'data.stats.totalHospitals': '医院数量',
        'data.stats.totalDoctors': '医生数量',
      },
    },
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
): ToolDefinition['handler'] {
  return async (args: unknown) => {
    toolLogger.toolCall(GET_SUBSCRIPTIONS_TOOL_NAME, args);

    try {
      const params = GetSubscriptionsParametersSchema.parse(args);

      let targetHospital: string | null = null;
      let isAlias = false;

      if (params.hospitalName) {
        const resolved = hospitalService.resolveHospitalName(params.hospitalName);
        if (resolved) {
          targetHospital = resolved.name;
          isAlias = resolved.isAlias;
        } else {
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

      if (params.type === 'all' || params.type === 'hospitals' || params.type === 'departments') {
        const allHospitals = hospitalService.getHospitals();

        if (targetHospital) {
          const hospital = allHospitals.find(
            h => h.name.toLowerCase() === targetHospital!.toLowerCase()
          );
          if (hospital) {
            if (params.type === 'departments' && (!hospital.departments || hospital.departments.length === 0)) {
              // skip
            } else {
              result.hospitals = [hospital];
            }
          }
        } else {
          if (params.type === 'departments') {
            result.hospitals = allHospitals.filter(
              h => h.departments && h.departments.length > 0
            );
          } else {
            result.hospitals = allHospitals;
          }
        }

        result.stats.totalHospitals = result.hospitals.length;
        result.stats.totalDepartments = result.hospitals.reduce(
          (sum, h) => sum + (h.departments?.length || 0),
          0
        );
        result.stats.primaryHospital = hospitalService.getPrimaryHospital()?.name || null;
      }

      if (params.type === 'all' || params.type === 'doctors') {
        let doctors = doctorService.getDoctors();

        if (targetHospital) {
          doctors = doctors.filter(
            d => d.hospital.toLowerCase() === targetHospital!.toLowerCase()
          );
        }

        result.doctors = doctors;
        result.stats.totalDoctors = doctors.length;
        result.stats.primaryDoctor = doctorService.getPrimaryDoctor()?.name || null;
      }

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

function buildMessage(
  type: string,
  result: SubscriptionResult,
  filterHospital?: string | null,
  isAlias?: boolean
): string {
  const hospitalSuffix = filterHospital
    ? `（${filterHospital}${isAlias ? ' - 通过别名匹配' : ''}）`
    : '';

  if (result.hospitals.length === 0 && result.doctors.length === 0) {
    if (filterHospital) {
      return `未找到 "${filterHospital}" 的订阅信息`;
    }
    return '您尚未订阅任何医院或医生。使用 subscribe_hospital 或 subscribe_doctor 工具添加订阅。';
  }

  const lines: string[] = [];

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
