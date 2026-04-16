import { createLogger } from '../utils/plugin-logger';
import { HospitalSubscriptionService } from './hospital-subscription.service';
import type { KnowledgeCollectionService } from './knowledge-collection/knowledge-collection.service';
import type { ISubscriptionDatabase, DoctorSubscriptionDB } from './subscription-db.interface';
import { subscriptionDB as defaultSubscriptionDB } from './subscription-db.service';

const logger = createLogger('REPSCLAW:DOCTOR');

/**
 * 医生订阅服务
 * 管理用户的医生订阅，使用 Markdown 文件持久化存储
 * 注意：医生以 医院+姓名 作为唯一标识
 *
 * 增强功能：订阅新医生时自动触发信息采集
 */
export class DoctorSubscriptionService {
  private hospitalSubscriptionService: HospitalSubscriptionService;
  private subscriptionDB: ISubscriptionDatabase;
  private collectionService?: KnowledgeCollectionService;

  constructor(
    hospitalSubscriptionService: HospitalSubscriptionService,
    subscriptionDB?: ISubscriptionDatabase,
    collectionService?: KnowledgeCollectionService
  ) {
    this.hospitalSubscriptionService = hospitalSubscriptionService;
    this.subscriptionDB = subscriptionDB || defaultSubscriptionDB;
    this.collectionService = collectionService;

    logger.info('DoctorSubscriptionService initialized', {
      collectionEnabled: !!collectionService,
    });
  }

  /**
   * 设置采集服务（用于延迟注入）
   */
  setCollectionService(service: KnowledgeCollectionService): void {
    this.collectionService = service;
    logger.info('Collection service injected into DoctorSubscriptionService');
  }

  /**
   * 验证医院是否已订阅
   */
  private validateHospital(hospital: string): { valid: boolean; resolvedName?: string; error?: string } {
    // 尝试解析医院名称（支持别名）
    const resolved = this.hospitalSubscriptionService.resolveHospitalName(hospital);

    if (!resolved) {
      return {
        valid: false,
        error: `医院 "${hospital}" 未订阅。请先使用 subscribe_hospital 订阅该医院。`,
      };
    }

    // 检查是否确实已订阅
    if (!this.hospitalSubscriptionService.isSubscribed(resolved.name)) {
      return {
        valid: false,
        error: `医院 "${resolved.name}" 未订阅。请先使用 subscribe_hospital 订阅该医院。`,
      };
    }

    return {
      valid: true,
      resolvedName: resolved.name,
    };
  }

  /**
   * 获取所有订阅的医生
   */
  getDoctors(): DoctorSubscriptionDB[] {
    return this.subscriptionDB.getDoctors();
  }

  /**
   * 按医院筛选医生
   */
  getDoctorsByHospital(hospital: string): DoctorSubscriptionDB[] {
    return this.subscriptionDB.getDoctors(hospital);
  }

  /**
   * 获取主要医生
   */
  getPrimaryDoctor(): DoctorSubscriptionDB | null {
    return this.subscriptionDB.getPrimaryDoctor();
  }

  /**
   * 检查是否已订阅某医生
   */
  isSubscribed(hospital: string, name: string): boolean {
    return this.subscriptionDB.isDoctorSubscribed(hospital, name);
  }

  /**
   * 查找医生（支持模糊匹配）
   */
  findDoctor(hospital: string, name: string): DoctorSubscriptionDB | null {
    const doctors = this.getDoctorsByHospital(hospital);

    // 先尝试精确匹配
    const exactMatch = doctors.find(
      d => d.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // 尝试模糊匹配
    const fuzzyMatch = doctors.find(
      d => d.name.toLowerCase().includes(name.toLowerCase())
    );
    if (fuzzyMatch) return fuzzyMatch;

    return null;
  }

  /**
   * 订阅医生
   *
   * 如果是新订阅，自动触发医生信息采集
   */
  async subscribe(
    hospital: string,
    name: string,
    department?: string,
    isPrimary: boolean = false
  ): Promise<{
    success: boolean;
    subscription?: DoctorSubscriptionDB;
    error?: string;
    isExisting?: boolean;
    collection?: {
      jobId: string;
      streamUrl: string;
      estimatedTime: string;
    };
  }> {
    // 验证医院是否已订阅
    const hospitalValidation = this.validateHospital(hospital);
    if (!hospitalValidation.valid) {
      return { success: false, error: hospitalValidation.error };
    }

    const resolvedHospital = hospitalValidation.resolvedName!;

    // 检查是否为新订阅（用于后续触发采集）
    const isNewSubscription = !this.isSubscribed(resolvedHospital, name);

    // 调用数据库订阅方法
    const result = this.subscriptionDB.subscribeDoctor(resolvedHospital, name, department);

    // 如果设为主要医生
    if (isPrimary && result.success) {
      this.subscriptionDB.setPrimaryDoctor(resolvedHospital, name);
    }

    // 获取更新后的订阅信息
    const subscription = this.findDoctor(resolvedHospital, name);

    // 如果是新订阅，自动触发信息采集
    let collection: { jobId: string; streamUrl: string; estimatedTime: string } | undefined;
    if (isNewSubscription && this.collectionService) {
      try {
        const job = await this.triggerDoctorCollection(resolvedHospital, name);
        collection = {
          jobId: job.id,
          streamUrl: `/api/repsclaw/collection/${job.id}/stream`,
          estimatedTime: '5-15分钟',
        };
        logger.info('Doctor collection triggered for new subscription', {
          hospital: resolvedHospital,
          doctor: name,
          jobId: job.id,
        });
      } catch (error) {
        logger.error('Failed to trigger doctor collection', {
          hospital: resolvedHospital,
          doctor: name,
          error,
        });
      }
    }

    if (result.isExisting) {
      logger.info('Doctor already subscribed, updated', { hospital: resolvedHospital, name, isPrimary });
      return {
        success: true,
        subscription,
        isExisting: true,
      };
    }

    logger.info('Subscribed to doctor', {
      hospital: resolvedHospital,
      name,
      isPrimary,
      collectionTriggered: isNewSubscription && !!this.collectionService,
    });

    return {
      success: true,
      subscription: subscription || undefined,
      isExisting: false,
      collection,
    };
  }

  /**
   * 触发医生信息采集（异步，不阻塞响应）
   */
  private async triggerDoctorCollection(
    hospitalName: string,
    doctorName: string
  ): Promise<void> {
    if (!this.collectionService) {
      logger.warn('Collection service not available, skipping doctor collection');
      return;
    }

    try {
      // 等待一小段时间确保订阅已持久化
      await this.delay(1000);

      // 检查是否已有正在运行的采集任务
      if (this.collectionService.hasActiveDoctorCollection(hospitalName, doctorName)) {
        logger.info('Doctor collection already in progress', {
          hospital: hospitalName,
          doctor: doctorName,
        });
        return;
      }

      // 启动医生信息采集（默认回溯90天）
      const job = await this.collectionService.startDoctorCollection(
        hospitalName,
        doctorName,
        {
          days: 90,
          isBootstrap: true,
        }
      );

      logger.info('Doctor collection triggered for new subscription', {
        hospital: hospitalName,
        doctor: doctorName,
        jobId: job.id,
      });
    } catch (error) {
      logger.error('Error triggering doctor collection', {
        hospital: hospitalName,
        doctor: doctorName,
        error,
      });
      throw error;
    }
  }

  /**
   * 延迟工具
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 取消订阅医生
   */
  unsubscribe(hospital: string, name: string): { success: boolean; error?: string } {
    const result = this.subscriptionDB.unsubscribeDoctor(hospital, name);

    if (result) {
      logger.info('Unsubscribed from doctor', { hospital, name });
      return { success: true };
    }

    return {
      success: false,
      error: `未找到医生 "${name}"（${hospital}）的订阅`,
    };
  }

  /**
   * 设置主要医生
   */
  setPrimary(hospital: string, name: string): { success: boolean; error?: string } {
    const result = this.subscriptionDB.setPrimaryDoctor(hospital, name);

    if (result) {
      logger.info('Set primary doctor', { hospital, name });
      return { success: true };
    }

    return {
      success: false,
      error: `未找到医生 "${name}"（${hospital}）的订阅`,
    };
  }

  /**
   * 检查是否是首次使用（无订阅）
   */
  isFirstTime(): boolean {
    return this.getDoctors().length === 0;
  }

  /**
   * 获取订阅统计
   */
  getStats(): { total: number; primary: { name: string; hospital: string } | null; byHospital: Record<string, number> } {
    const primary = this.getPrimaryDoctor();
    const doctors = this.getDoctors();
    const byHospital: Record<string, number> = {};

    for (const doctor of doctors) {
      byHospital[doctor.hospital] = (byHospital[doctor.hospital] || 0) + 1;
    }

    return {
      total: doctors.length,
      primary: primary ? { name: primary.name, hospital: primary.hospital } : null,
      byHospital,
    };
  }

  /**
   * 清除所有订阅（用于测试）
   */
  clearAll(): void {
    const doctors = this.getDoctors();
    for (const doctor of doctors) {
      this.subscriptionDB.unsubscribeDoctor(doctor.hospital, doctor.name);
    }
    logger.info('Cleared all doctor subscriptions');
  }
}

// 导出接口类型
export type { DoctorSubscriptionDB } from './subscription-db.interface';
