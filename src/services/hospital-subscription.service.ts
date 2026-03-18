import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/plugin-logger';
import { HospitalNameResolver, HospitalMatch } from '../utils/hospital-name-resolver';

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
 * 订阅存储数据
 */
export interface SubscriptionData {
  hospitals: HospitalSubscription[];
  lastPromptedDate: string | null;
}

/**
 * 医院订阅服务
 * 管理用户的医院订阅，支持持久化存储
 */
export class HospitalSubscriptionService {
  private storagePath: string;
  private data: SubscriptionData;

  constructor() {
    // 存储路径: ~/.openclaw/repsclaw/hospital-subscriptions.json
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const openclawDir = path.join(homeDir, '.openclaw');
    const repsclawDir = path.join(openclawDir, 'repsclaw');
    this.storagePath = path.join(repsclawDir, 'hospital-subscriptions.json');

    // 确保目录存在
    if (!fs.existsSync(repsclawDir)) {
      fs.mkdirSync(repsclawDir, { recursive: true });
    }

    this.data = this.loadData();
    logger.info('HospitalSubscriptionService initialized', {
      storagePath: this.storagePath,
      hospitalCount: this.data.hospitals.length,
    });
  }

  /**
   * 加载订阅数据
   */
  private loadData(): SubscriptionData {
    try {
      if (fs.existsSync(this.storagePath)) {
        const content = fs.readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(content);
        logger.info('Loaded subscription data', {
          hospitals: data.hospitals?.length || 0,
          lastPromptedDate: data.lastPromptedDate,
        });
        return {
          hospitals: data.hospitals || [],
          lastPromptedDate: data.lastPromptedDate || null,
        };
      }
    } catch (error) {
      logger.error('Failed to load subscription data', error);
    }

    return {
      hospitals: [],
      lastPromptedDate: null,
    };
  }

  /**
   * 保存订阅数据
   */
  private saveData(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
      logger.debug('Saved subscription data');
    } catch (error) {
      logger.error('Failed to save subscription data', error);
    }
  }

  /**
   * 获取所有订阅的医院
   */
  getHospitals(): HospitalSubscription[] {
    return [...this.data.hospitals];
  }

  /**
   * 获取主要医院
   */
  getPrimaryHospital(): HospitalSubscription | null {
    return this.data.hospitals.find(h => h.isPrimary) || this.data.hospitals[0] || null;
  }

  /**
   * 检查是否已订阅某医院
   */
  isSubscribed(name: string): boolean {
    return this.data.hospitals.some(
      h => h.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * 通过别名查找已订阅的医院
   */
  findHospitalByAlias(input: string): HospitalMatch | null {
    const candidates = this.data.hospitals.map(h => h.name);
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
    const exactMatch = this.data.hospitals.find(
      h => h.name.toLowerCase() === input.toLowerCase()
    );
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
    // 如果已存在，更新为主要医院（如果指定）
    const existingIndex = this.data.hospitals.findIndex(
      h => h.name.toLowerCase() === name.toLowerCase()
    );

    if (existingIndex >= 0) {
      if (isPrimary) {
        // 取消其他医院的主要状态
        this.data.hospitals.forEach(h => h.isPrimary = false);
        this.data.hospitals[existingIndex].isPrimary = true;
        this.saveData();
      }
      logger.info('Hospital already subscribed, updated', { name, isPrimary });
      return this.data.hospitals[existingIndex];
    }

    // 如果是第一个订阅，自动设为主要
    if (this.data.hospitals.length === 0) {
      isPrimary = true;
    }

    // 如果设为主要，取消其他的主要状态
    if (isPrimary) {
      this.data.hospitals.forEach(h => h.isPrimary = false);
    }

    const subscription: HospitalSubscription = {
      name,
      subscribedAt: new Date().toISOString(),
      isPrimary,
    };

    this.data.hospitals.push(subscription);
    this.saveData();

    logger.info('Subscribed to hospital', { name, isPrimary });
    return subscription;
  }

  /**
   * 取消订阅
   */
  unsubscribe(name: string): boolean {
    const index = this.data.hospitals.findIndex(
      h => h.name.toLowerCase() === name.toLowerCase()
    );

    if (index >= 0) {
      const wasPrimary = this.data.hospitals[index].isPrimary;
      this.data.hospitals.splice(index, 1);

      // 如果取消的是主要医院，将第一个设为主要
      if (wasPrimary && this.data.hospitals.length > 0) {
        this.data.hospitals[0].isPrimary = true;
      }

      this.saveData();
      logger.info('Unsubscribed from hospital', { name });
      return true;
    }

    return false;
  }

  /**
   * 设置主要医院
   */
  setPrimary(name: string): boolean {
    const hospital = this.data.hospitals.find(
      h => h.name.toLowerCase() === name.toLowerCase()
    );

    if (hospital) {
      this.data.hospitals.forEach(h => h.isPrimary = false);
      hospital.isPrimary = true;
      this.saveData();
      logger.info('Set primary hospital', { name });
      return true;
    }

    return false;
  }

  /**
   * 检查是否是首次使用（无订阅）
   */
  isFirstTime(): boolean {
    return this.data.hospitals.length === 0;
  }

  /**
   * 获取上次提示日期
   */
  getLastPromptedDate(): string | null {
    return this.data.lastPromptedDate;
  }

  /**
   * 更新上次提示日期为今天
   */
  updateLastPromptedDate(): void {
    const today = new Date().toISOString().split('T')[0];
    this.data.lastPromptedDate = today;
    this.saveData();
    logger.info('Updated last prompted date', { date: today });
  }

  /**
   * 检查今天是否已经提示过
   */
  hasPromptedToday(): boolean {
    const today = new Date().toISOString().split('T')[0];
    return this.data.lastPromptedDate === today;
  }

  /**
   * 获取订阅统计
   */
  getStats(): { total: number; primary: string | null; totalDepartments: number } {
    const totalDepartments = this.data.hospitals.reduce(
      (sum, h) => sum + (h.departments?.length || 0),
      0
    );
    return {
      total: this.data.hospitals.length,
      primary: this.getPrimaryHospital()?.name || null,
      totalDepartments,
    };
  }

  // ========== 科室订阅管理 ==========

  /**
   * 订阅科室
   * @returns 是否成功添加（已存在返回 false）
   */
  subscribeDepartment(hospitalName: string, department: string): { success: boolean; isExisting: boolean; hospital?: HospitalSubscription } {
    const hospital = this.data.hospitals.find(
      h => h.name.toLowerCase() === hospitalName.toLowerCase()
    );

    if (!hospital) {
      return { success: false, isExisting: false };
    }

    if (!hospital.departments) {
      hospital.departments = [];
    }

    // 检查科室是否已订阅
    const exists = hospital.departments.some(
      d => d.toLowerCase() === department.toLowerCase()
    );

    if (exists) {
      return { success: true, isExisting: true, hospital };
    }

    hospital.departments.push(department);
    this.saveData();

    logger.info('Subscribed to department', { hospital: hospitalName, department });
    return { success: true, isExisting: false, hospital };
  }

  /**
   * 取消订阅科室
   * @param department 科室名称，不传则取消该医院所有科室
   * @returns 是否成功取消
   */
  unsubscribeDepartment(hospitalName: string, department?: string): { success: boolean; removedAll: boolean; hospital?: HospitalSubscription } {
    const hospital = this.data.hospitals.find(
      h => h.name.toLowerCase() === hospitalName.toLowerCase()
    );

    if (!hospital || !hospital.departments || hospital.departments.length === 0) {
      return { success: false, removedAll: false };
    }

    if (department) {
      // 取消特定科室
      const index = hospital.departments.findIndex(
        d => d.toLowerCase() === department.toLowerCase()
      );

      if (index === -1) {
        return { success: false, removedAll: false, hospital };
      }

      hospital.departments.splice(index, 1);

      // 如果没有科室了，删除 departments 字段
      if (hospital.departments.length === 0) {
        delete hospital.departments;
      }

      this.saveData();
      logger.info('Unsubscribed from department', { hospital: hospitalName, department });
      return { success: true, removedAll: false, hospital };
    } else {
      // 取消所有科室
      const count = hospital.departments.length;
      delete hospital.departments;
      this.saveData();
      logger.info('Unsubscribed all departments', { hospital: hospitalName, count });
      return { success: true, removedAll: true, hospital };
    }
  }

  /**
   * 获取医院订阅的科室列表
   */
  getDepartments(hospitalName: string): string[] | null {
    const hospital = this.data.hospitals.find(
      h => h.name.toLowerCase() === hospitalName.toLowerCase()
    );

    return hospital?.departments || null;
  }

  /**
   * 检查科室是否已订阅
   */
  isDepartmentSubscribed(hospitalName: string, department: string): boolean {
    const departments = this.getDepartments(hospitalName);
    if (!departments) return false;

    return departments.some(d => d.toLowerCase() === department.toLowerCase());
  }

  /**
   * 获取所有订阅的科室（跨医院）
   */
  getAllDepartments(): Array<{ hospital: string; departments: string[] }> {
    return this.data.hospitals
      .filter(h => h.departments && h.departments.length > 0)
      .map(h => ({
        hospital: h.name,
        departments: h.departments!,
      }));
  }
}
