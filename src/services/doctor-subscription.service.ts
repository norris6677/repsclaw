import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/plugin-logger';
import { HospitalSubscriptionService } from './hospital-subscription.service';

const logger = createLogger('REPSCLAW:DOCTOR');

/**
 * 医生订阅信息
 * 以 医院+医生名 作为唯一标识
 */
export interface DoctorSubscription {
  name: string;           // 医生姓名
  hospital: string;       // 所属医院（标准化名称）
  department?: string;    // 科室（可选）
  subscribedAt: string;
  isPrimary: boolean;     // 是否为主要关注医生
}

/**
 * 医生订阅存储数据
 */
export interface DoctorSubscriptionData {
  doctors: DoctorSubscription[];
}

/**
 * 医生唯一标识（内部使用）
 */
interface DoctorKey {
  hospital: string;
  name: string;
}

/**
 * 医生订阅服务
 * 管理用户的医生订阅，支持持久化存储
 * 注意：医生以 医院+姓名 作为唯一标识
 */
export class DoctorSubscriptionService {
  private storagePath: string;
  private data: DoctorSubscriptionData;
  private hospitalSubscriptionService: HospitalSubscriptionService;

  constructor(hospitalSubscriptionService: HospitalSubscriptionService) {
    // 存储路径: ~/.openclaw/repsclaw/doctor-subscriptions.json
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
    const openclawDir = path.join(homeDir, '.openclaw');
    const repsclawDir = path.join(openclawDir, 'repsclaw');
    this.storagePath = path.join(repsclawDir, 'doctor-subscriptions.json');

    // 确保目录存在
    if (!fs.existsSync(repsclawDir)) {
      fs.mkdirSync(repsclawDir, { recursive: true });
    }

    this.hospitalSubscriptionService = hospitalSubscriptionService;
    this.data = this.loadData();

    logger.info('DoctorSubscriptionService initialized', {
      storagePath: this.storagePath,
      doctorCount: this.data.doctors.length,
    });
  }

  /**
   * 加载订阅数据
   */
  private loadData(): DoctorSubscriptionData {
    try {
      if (fs.existsSync(this.storagePath)) {
        const content = fs.readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(content);
        logger.info('Loaded doctor subscription data', {
          doctors: data.doctors?.length || 0,
        });
        return {
          doctors: data.doctors || [],
        };
      }
    } catch (error) {
      logger.error('Failed to load doctor subscription data', error);
    }

    return {
      doctors: [],
    };
  }

  /**
   * 保存订阅数据
   */
  private saveData(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
      logger.debug('Saved doctor subscription data');
    } catch (error) {
      logger.error('Failed to save doctor subscription data', error);
    }
  }

  /**
   * 生成医生唯一键
   */
  private makeKey(hospital: string, name: string): string {
    return `${hospital.trim().toLowerCase()}::${name.trim().toLowerCase()}`;
  }

  /**
   * 解析医生唯一键
   */
  private parseKey(key: string): DoctorKey {
    const parts = key.split('::');
    return {
      hospital: parts[0] || '',
      name: parts[1] || '',
    };
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
  getDoctors(): DoctorSubscription[] {
    return [...this.data.doctors];
  }

  /**
   * 按医院筛选医生
   */
  getDoctorsByHospital(hospital: string): DoctorSubscription[] {
    return this.data.doctors.filter(
      d => d.hospital.toLowerCase() === hospital.toLowerCase()
    );
  }

  /**
   * 获取主要医生
   */
  getPrimaryDoctor(): DoctorSubscription | null {
    return this.data.doctors.find(d => d.isPrimary) || this.data.doctors[0] || null;
  }

  /**
   * 检查是否已订阅某医生
   */
  isSubscribed(hospital: string, name: string): boolean {
    const key = this.makeKey(hospital, name);
    return this.data.doctors.some(
      d => this.makeKey(d.hospital, d.name) === key
    );
  }

  /**
   * 查找医生（支持模糊匹配）
   */
  findDoctor(hospital: string, name: string): DoctorSubscription | null {
    // 先尝试精确匹配
    const exactMatch = this.data.doctors.find(
      d => d.hospital.toLowerCase() === hospital.toLowerCase() &&
           d.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // 尝试仅匹配医生名（在同医院内）
    const nameMatch = this.data.doctors.find(
      d => d.hospital.toLowerCase() === hospital.toLowerCase() &&
           d.name.toLowerCase().includes(name.toLowerCase())
    );
    if (nameMatch) return nameMatch;

    return null;
  }

  /**
   * 订阅医生
   */
  subscribe(
    hospital: string,
    name: string,
    department?: string,
    isPrimary: boolean = false
  ): { success: boolean; subscription?: DoctorSubscription; error?: string; isExisting?: boolean } {
    // 验证医院是否已订阅
    const hospitalValidation = this.validateHospital(hospital);
    if (!hospitalValidation.valid) {
      return { success: false, error: hospitalValidation.error };
    }

    const resolvedHospital = hospitalValidation.resolvedName!;

    // 检查是否已存在
    const existingIndex = this.data.doctors.findIndex(
      d => d.hospital.toLowerCase() === resolvedHospital.toLowerCase() &&
           d.name.toLowerCase() === name.toLowerCase()
    );

    if (existingIndex >= 0) {
      // 已存在，更新信息
      const existing = this.data.doctors[existingIndex];

      // 更新科室（如果提供）
      if (department) {
        existing.department = department;
      }

      // 更新为主要医生（如果指定）
      if (isPrimary) {
        this.data.doctors.forEach(d => d.isPrimary = false);
        existing.isPrimary = true;
      }

      this.saveData();
      logger.info('Doctor already subscribed, updated', { hospital: resolvedHospital, name, isPrimary });

      return {
        success: true,
        subscription: existing,
        isExisting: true,
      };
    }

    // 如果是第一个订阅，自动设为主要
    if (this.data.doctors.length === 0) {
      isPrimary = true;
    }

    // 如果设为主要，取消其他的主要状态
    if (isPrimary) {
      this.data.doctors.forEach(d => d.isPrimary = false);
    }

    const subscription: DoctorSubscription = {
      name: name.trim(),
      hospital: resolvedHospital,
      department: department?.trim(),
      subscribedAt: new Date().toISOString(),
      isPrimary,
    };

    this.data.doctors.push(subscription);
    this.saveData();

    logger.info('Subscribed to doctor', { hospital: resolvedHospital, name, isPrimary });

    return {
      success: true,
      subscription,
      isExisting: false,
    };
  }

  /**
   * 取消订阅医生
   */
  unsubscribe(hospital: string, name: string): { success: boolean; error?: string } {
    const index = this.data.doctors.findIndex(
      d => d.hospital.toLowerCase() === hospital.toLowerCase() &&
           d.name.toLowerCase() === name.toLowerCase()
    );

    if (index >= 0) {
      const wasPrimary = this.data.doctors[index].isPrimary;
      const doctorName = this.data.doctors[index].name;
      const hospitalName = this.data.doctors[index].hospital;

      this.data.doctors.splice(index, 1);

      // 如果取消的是主要医生，将第一个设为主要
      if (wasPrimary && this.data.doctors.length > 0) {
        this.data.doctors[0].isPrimary = true;
      }

      this.saveData();
      logger.info('Unsubscribed from doctor', { hospital: hospitalName, name: doctorName });

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
    const doctor = this.data.doctors.find(
      d => d.hospital.toLowerCase() === hospital.toLowerCase() &&
           d.name.toLowerCase() === name.toLowerCase()
    );

    if (doctor) {
      this.data.doctors.forEach(d => d.isPrimary = false);
      doctor.isPrimary = true;
      this.saveData();
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
    return this.data.doctors.length === 0;
  }

  /**
   * 获取订阅统计
   */
  getStats(): { total: number; primary: { name: string; hospital: string } | null; byHospital: Record<string, number> } {
    const primary = this.getPrimaryDoctor();
    const byHospital: Record<string, number> = {};

    for (const doctor of this.data.doctors) {
      byHospital[doctor.hospital] = (byHospital[doctor.hospital] || 0) + 1;
    }

    return {
      total: this.data.doctors.length,
      primary: primary ? { name: primary.name, hospital: primary.hospital } : null,
      byHospital,
    };
  }

  /**
   * 清除所有订阅（用于测试）
   */
  clearAll(): void {
    this.data.doctors = [];
    this.saveData();
    logger.info('Cleared all doctor subscriptions');
  }
}
