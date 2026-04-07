import { createLogger } from '../utils/plugin-logger';
import { HospitalNameResolver, HospitalMatch } from '../utils/hospital-name-resolver';
import type { ISubscriptionDatabase } from './subscription-db.interface';
import { subscriptionDB as defaultSubscriptionDB } from './subscription-db.service';

const logger = createLogger('REPSCLAW:HOSPITAL');

/**
 * 医院订阅信息
 */
export interface HospitalSubscription {
  name: string;
  subscribedAt: string;
  isPrimary: boolean;
  departments?: string[];  // 订阅的科室列表
}

/**
 * 医院订阅服务
 * 管理用户的医院订阅，使用 Markdown 文件持久化存储
 */
export class HospitalSubscriptionService {
  private subscriptionDB: ISubscriptionDatabase;

  constructor(subscriptionDB?: ISubscriptionDatabase) {
    this.subscriptionDB = subscriptionDB || defaultSubscriptionDB;
    logger.info('HospitalSubscriptionService initialized', {
      hospitalCount: this.subscriptionDB.getCount(),
    });
  }

  /**
   * 获取所有订阅的医院
   */
  getHospitals(): HospitalSubscription[] {
    return this.subscriptionDB.getAll();
  }

  /**
   * 获取主要医院
   */
  getPrimaryHospital(): HospitalSubscription | null {
    return this.subscriptionDB.getPrimary();
  }

  /**
   * 检查是否已订阅某医院
   */
  isSubscribed(name: string): boolean {
    return this.subscriptionDB.isSubscribed(name);
  }

  /**
   * 通过别名查找已订阅的医院
   */
  findHospitalByAlias(input: string): HospitalMatch | null {
    const candidates = this.subscriptionDB.getAll().map(h => h.name);
    logger.debug('findHospitalByAlias', { input, candidates });
    const result = HospitalNameResolver.findHospital(input, candidates);
    logger.debug('findHospitalByAlias result', { input, result });
    return result;
  }

  /**
   * 获取精确匹配或最佳匹配的医院名称
   */
  resolveHospitalName(input: string): { name: string; isAlias: boolean } | null {
    logger.debug('resolveHospitalName', { input });

    // 先尝试精确匹配
    const exactMatch = this.subscriptionDB.getByName(input);
    if (exactMatch) {
      logger.debug('resolveHospitalName - exact match', { name: exactMatch.name });
      return { name: exactMatch.name, isAlias: false };
    }

    // 尝试别名匹配
    const match = this.findHospitalByAlias(input);
    logger.debug('resolveHospitalName - alias match check', { match });

    if (match && match.score >= 0.7) {
      logger.info('resolveHospitalName - resolved via alias', {
        input,
        resolved: match.name,
        score: match.score,
        matchType: match.matchType,
      });
      return { name: match.name, isAlias: match.matchType !== 'exact' };
    }

    logger.debug('resolveHospitalName - no match found', { input });
    return null;
  }

  /**
   * 订阅医院
   */
  subscribe(name: string, isPrimary: boolean = false): HospitalSubscription {
    return this.subscriptionDB.subscribe(name, isPrimary);
  }

  /**
   * 取消订阅
   */
  unsubscribe(name: string): boolean {
    return this.subscriptionDB.unsubscribe(name);
  }

  /**
   * 设置主要医院
   */
  setPrimary(name: string): boolean {
    return this.subscriptionDB.setPrimary(name);
  }

  /**
   * 检查是否是首次使用（无订阅）
   */
  isFirstTime(): boolean {
    return this.subscriptionDB.getCount() === 0;
  }

  /**
   * 获取上次提示日期
   */
  getLastPromptedDate(): string | null {
    return this.subscriptionDB.getLastPromptedDate();
  }

  /**
   * 更新上次提示日期为今天
   */
  updateLastPromptedDate(): void {
    this.subscriptionDB.updateLastPromptedDate();
  }

  /**
   * 检查今天是否已经提示过
   */
  hasPromptedToday(): boolean {
    return this.subscriptionDB.hasPromptedToday();
  }

  /**
   * 获取订阅统计
   */
  getStats(): { total: number; primary: string | null; totalDepartments: number } {
    const stats = this.subscriptionDB.getStats();
    return {
      total: stats.totalHospitals,
      primary: stats.primary,
      totalDepartments: stats.totalDepartments,
    };
  }

  // ========== 科室订阅管理 ==========

  /**
   * 订阅科室
   * @returns 是否成功添加（已存在返回 false）
   */
  subscribeDepartment(hospitalName: string, department: string): { success: boolean; isExisting: boolean; hospital?: HospitalSubscription } {
    const result = this.subscriptionDB.subscribeDepartment(hospitalName, department);
    const hospital = this.subscriptionDB.getByName(hospitalName);
    return { ...result, hospital: hospital || undefined };
  }

  /**
   * 取消订阅科室
   * @param department 科室名称，不传则取消该医院所有科室
   * @returns 是否成功取消
   */
  unsubscribeDepartment(hospitalName: string, department?: string): { success: boolean; removedAll: boolean; hospital?: HospitalSubscription } {
    const result = this.subscriptionDB.unsubscribeDepartment(hospitalName, department);
    const hospital = this.subscriptionDB.getByName(hospitalName);
    return { ...result, hospital: hospital || undefined };
  }

  /**
   * 获取医院订阅的科室列表
   */
  getDepartments(hospitalName: string): string[] | null {
    return this.subscriptionDB.getDepartments(hospitalName);
  }

  /**
   * 检查科室是否已订阅
   */
  isDepartmentSubscribed(hospitalName: string, department: string): boolean {
    return this.subscriptionDB.isDepartmentSubscribed(hospitalName, department);
  }

  /**
   * 获取所有订阅的科室（跨医院）
   */
  getAllDepartments(): Array<{ hospital: string; departments: string[] }> {
    return this.subscriptionDB.getAll()
      .filter(h => h.departments && h.departments.length > 0)
      .map(h => ({
        hospital: h.name,
        departments: h.departments!,
      }));
  }
}
