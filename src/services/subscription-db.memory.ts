/**
 * Memory Subscription Database
 * In-memory implementation of ISubscriptionDatabase for testing
 * Data is lost when process exits
 */

import { createLogger } from '../utils/plugin-logger';
import type { ISubscriptionDatabase, HospitalSubscriptionDB, DoctorSubscriptionDB } from './subscription-db.interface';

const logger = createLogger('REPSCLAW:MEMORY-DB');

interface MemoryNewsCache {
  id: string;
  hospitalName: string;
  sourceType: string;
  title: string;
  summary: string;
  originalUrl: string;
  publishedAt: string;
  fetchedAt: string;
  relevanceScore: number;
  sentiment: string;
  categories: string[];
  data: any;
}

interface MemoryDoctor {
  id: number;
  name: string;
  hospital: string;
  department?: string;
  isPrimary: boolean;
  subscribedAt: string;
}

export class MemorySubscriptionDatabase implements ISubscriptionDatabase {
  private hospitals: Map<number, HospitalSubscriptionDB> = new Map();
  private departments: Map<number, Set<string>> = new Map(); // hospitalId -> departments
  private doctors: Map<number, MemoryDoctor> = new Map(); // id -> doctor
  private newsCache: Map<string, MemoryNewsCache> = new Map(); // id -> news item
  private nextId: number = 1;
  private nextDoctorId: number = 1;

  constructor() {
    logger.info('MemorySubscriptionDatabase initialized (data will be lost on exit)');
  }

  // ========== Hospital Subscription Management ==========

  subscribe(name: string, isPrimary: boolean = false): HospitalSubscriptionDB {
    // Check if already exists
    const existing = this.getByName(name);

    if (existing) {
      if (isPrimary) {
        this.clearAllPrimary();
        existing.isPrimary = true;
        this.hospitals.set(existing.id!, existing);
      }
      logger.info('Hospital already subscribed, updated', { name, isPrimary });
      return existing;
    }

    // If first subscription, auto-set as primary
    if (this.getCount() === 0) {
      isPrimary = true;
    }

    // If setting as primary, clear others
    if (isPrimary) {
      this.clearAllPrimary();
    }

    const id = this.nextId++;
    const hospital: HospitalSubscriptionDB = {
      id,
      name,
      isPrimary,
      subscribedAt: new Date().toISOString(),
      lastPromptedDate: null,
      lastQueryAt: null,
    };

    this.hospitals.set(id, hospital);
    this.departments.set(id, new Set());

    logger.info('Subscribed to hospital', { name, isPrimary, id });
    return hospital;
  }

  unsubscribe(name: string): boolean {
    const hospital = this.getByName(name);
    if (!hospital) return false;

    const wasPrimary = hospital.isPrimary;

    this.hospitals.delete(hospital.id!);
    this.departments.delete(hospital.id!);

    // If unsubscribing primary, set first as primary
    if (wasPrimary) {
      const allHospitals = this.getAll();
      const first = allHospitals.length > 0 ? allHospitals[0] : null;
      if (first) {
        first.isPrimary = true;
        this.hospitals.set(first.id!, first);
      }
    }

    logger.info('Unsubscribed from hospital', { name });
    return true;
  }

  getAll(): HospitalSubscriptionDB[] {
    return Array.from(this.hospitals.values()).sort((a, b) => {
      // Sort by primary first, then by subscribedAt
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return new Date(a.subscribedAt).getTime() - new Date(b.subscribedAt).getTime();
    });
  }

  getById(id: number): HospitalSubscriptionDB | null {
    const hospital = this.hospitals.get(id);
    if (!hospital) return null;

    // Add departments
    const deptSet = this.departments.get(id);
    return {
      ...hospital,
      departments: deptSet ? Array.from(deptSet) : [],
    };
  }

  getByName(name: string): HospitalSubscriptionDB | null {
    for (const hospital of Array.from(this.hospitals.values())) {
      if (hospital.name.toLowerCase() === name.toLowerCase()) {
        return this.getById(hospital.id!);
      }
    }
    return null;
  }

  getPrimary(): HospitalSubscriptionDB | null {
    for (const hospital of Array.from(this.hospitals.values())) {
      if (hospital.isPrimary) {
        return this.getById(hospital.id!);
      }
    }
    // If no primary, return first
    const first = this.getAll()[0];
    return first || null;
  }

  setPrimary(name: string): boolean {
    const hospital = this.getByName(name);
    if (!hospital) return false;

    this.clearAllPrimary();
    hospital.isPrimary = true;
    this.hospitals.set(hospital.id!, hospital);

    logger.info('Set primary hospital', { name });
    return true;
  }

  isSubscribed(name: string): boolean {
    return this.getByName(name) !== null;
  }

  getCount(): number {
    return this.hospitals.size;
  }

  private clearAllPrimary(): void {
    for (const hospital of Array.from(this.hospitals.values())) {
      hospital.isPrimary = false;
    }
  }

  // ========== Department Subscription Management ==========

  subscribeDepartment(hospitalName: string, department: string): { success: boolean; isExisting: boolean } {
    const hospital = this.getByName(hospitalName);
    if (!hospital) return { success: false, isExisting: false };

    const deptSet = this.departments.get(hospital.id!) || new Set();

    if (deptSet.has(department)) {
      return { success: true, isExisting: true };
    }

    deptSet.add(department);
    this.departments.set(hospital.id!, deptSet);

    logger.info('Subscribed to department', { hospital: hospitalName, department });
    return { success: true, isExisting: false };
  }

  unsubscribeDepartment(hospitalName: string, department?: string): { success: boolean; removedAll: boolean } {
    const hospital = this.getByName(hospitalName);
    if (!hospital) return { success: false, removedAll: false };

    const deptSet = this.departments.get(hospital.id!);
    if (!deptSet) return { success: false, removedAll: false };

    if (department) {
      const existed = deptSet.delete(department);
      logger.info('Unsubscribed from department', { hospital: hospitalName, department });
      return { success: existed, removedAll: false };
    } else {
      const count = deptSet.size;
      deptSet.clear();
      logger.info('Unsubscribed all departments', { hospital: hospitalName, count });
      return { success: count > 0, removedAll: true };
    }
  }

  getDepartments(hospitalName: string): string[] | null {
    const hospital = this.getByName(hospitalName);
    if (!hospital) return null;

    const deptSet = this.departments.get(hospital.id!);
    return deptSet ? Array.from(deptSet) : [];
  }

  isDepartmentSubscribed(hospitalName: string, department: string): boolean {
    const hospital = this.getByName(hospitalName);
    if (!hospital) return false;

    const deptSet = this.departments.get(hospital.id!);
    return deptSet ? deptSet.has(department) : false;
  }

  // ========== Prompt Date Management ==========

  getLastPromptedDate(): string | null {
    let maxDate: string | null = null;
    for (const hospital of Array.from(this.hospitals.values())) {
      if (hospital.lastPromptedDate) {
        if (!maxDate || hospital.lastPromptedDate > maxDate) {
          maxDate = hospital.lastPromptedDate;
        }
      }
    }
    return maxDate;
  }

  updateLastPromptedDate(): void {
    const today = new Date().toISOString().split('T')[0];
    for (const hospital of Array.from(this.hospitals.values())) {
      hospital.lastPromptedDate = today;
    }
    logger.info('Updated last prompted date', { date: today });
  }

  hasPromptedToday(): boolean {
    const today = new Date().toISOString().split('T')[0];
    for (const hospital of Array.from(this.hospitals.values())) {
      if (hospital.lastPromptedDate === today) {
        return true;
      }
    }
    return false;
  }

  // ========== News Query Time Management ==========

  updateLastQueryTime(hospitalName: string): void {
    const hospital = this.getByName(hospitalName);
    if (hospital) {
      hospital.lastQueryAt = new Date().toISOString();
    }
  }

  getLastQueryTime(hospitalName: string): string | null {
    const hospital = this.getByName(hospitalName);
    return hospital?.lastQueryAt || null;
  }

  // ========== News Cache Management ==========

  getCachedNews(hospitalName: string, since?: Date): any[] {
    const results: any[] = [];

    for (const item of Array.from(this.newsCache.values())) {
      if (item.hospitalName.toLowerCase() === hospitalName.toLowerCase()) {
        if (!since || new Date(item.fetchedAt) > since) {
          results.push({
            id: item.id,
            hospitalName: item.hospitalName,
            sourceType: item.sourceType,
            title: item.title,
            summary: item.summary,
            originalUrl: item.originalUrl,
            publishedAt: item.publishedAt,
            fetchedAt: item.fetchedAt,
            relevanceScore: item.relevanceScore,
            sentiment: item.sentiment,
            categories: item.categories,
            ...item.data,
          });
        }
      }
    }

    return results.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  cacheNews(items: any[]): void {
    for (const item of items) {
      const cacheItem: MemoryNewsCache = {
        id: item.id,
        hospitalName: item.hospitalName || item.hospital,
        sourceType: item.source?.type || item.sourceType,
        title: item.title,
        summary: item.summary,
        originalUrl: item.originalUrl,
        publishedAt: item.publishedAt,
        fetchedAt: new Date().toISOString(),
        relevanceScore: item.relevanceScore,
        sentiment: item.sentiment,
        categories: Array.isArray(item.categories) ? item.categories : [],
        data: item,
      };
      this.newsCache.set(item.id, cacheItem);
    }
    logger.debug('Cached news items', { count: items.length });
  }

  cleanExpiredCache(maxAgeHours: number = 48): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let deleted = 0;

    for (const [id, item] of Array.from(this.newsCache.entries())) {
      if (new Date(item.fetchedAt) < cutoff) {
        this.newsCache.delete(id);
        deleted++;
      }
    }

    logger.info('Cleaned expired cache', { deleted, maxAgeHours });
    return deleted;
  }

  // ========== Doctor Subscription Management ==========

  subscribeDoctor(hospitalName: string, doctorName: string, department?: string): { success: boolean; isExisting: boolean } {
    // Check if already exists
    for (const doctor of Array.from(this.doctors.values())) {
      if (doctor.name.toLowerCase() === doctorName.toLowerCase() &&
          doctor.hospital.toLowerCase() === hospitalName.toLowerCase()) {
        // Update department if provided
        if (department) {
          doctor.department = department;
        }
        return { success: true, isExisting: true };
      }
    }

    // If first doctor, auto-set as primary
    const allDoctors = this.getDoctors();
    const isPrimary = allDoctors.length === 0;

    const id = this.nextDoctorId++;
    const doctor: MemoryDoctor = {
      id,
      name: doctorName,
      hospital: hospitalName,
      department,
      isPrimary,
      subscribedAt: new Date().toISOString(),
    };

    this.doctors.set(id, doctor);
    logger.info('Subscribed to doctor', { hospital: hospitalName, doctor: doctorName, id });
    return { success: true, isExisting: false };
  }

  unsubscribeDoctor(hospitalName: string, doctorName: string): boolean {
    for (const [id, doctor] of Array.from(this.doctors.entries())) {
      if (doctor.name.toLowerCase() === doctorName.toLowerCase() &&
          doctor.hospital.toLowerCase() === hospitalName.toLowerCase()) {
        const wasPrimary = doctor.isPrimary;
        this.doctors.delete(id);

        // If unsubscribing primary, set first as primary
        if (wasPrimary) {
          const remainingDoctors = this.getDoctors();
          if (remainingDoctors.length > 0) {
            const first = remainingDoctors[0];
            first.isPrimary = true;
            this.doctors.set(first.id!, first);
          }
        }

        logger.info('Unsubscribed from doctor', { hospital: hospitalName, doctor: doctorName });
        return true;
      }
    }
    return false;
  }

  getDoctors(hospitalName?: string): DoctorSubscriptionDB[] {
    const results: DoctorSubscriptionDB[] = [];

    for (const doctor of Array.from(this.doctors.values())) {
      if (!hospitalName || doctor.hospital.toLowerCase() === hospitalName.toLowerCase()) {
        results.push({
          id: doctor.id,
          name: doctor.name,
          hospital: doctor.hospital,
          department: doctor.department,
          isPrimary: doctor.isPrimary,
          subscribedAt: doctor.subscribedAt,
        });
      }
    }

    // Sort by primary first, then by subscribedAt
    return results.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      return new Date(a.subscribedAt).getTime() - new Date(b.subscribedAt).getTime();
    });
  }

  getPrimaryDoctor(): DoctorSubscriptionDB | null {
    const doctors = this.getDoctors();
    return doctors.find(d => d.isPrimary) || doctors[0] || null;
  }

  isDoctorSubscribed(hospitalName: string, doctorName: string): boolean {
    for (const doctor of Array.from(this.doctors.values())) {
      if (doctor.name.toLowerCase() === doctorName.toLowerCase() &&
          doctor.hospital.toLowerCase() === hospitalName.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  setPrimaryDoctor(hospitalName: string, doctorName: string): boolean {
    // Find the doctor
    let targetDoctor: MemoryDoctor | null = null;
    for (const doctor of Array.from(this.doctors.values())) {
      if (doctor.name.toLowerCase() === doctorName.toLowerCase() &&
          doctor.hospital.toLowerCase() === hospitalName.toLowerCase()) {
        targetDoctor = doctor;
      } else if (doctor.isPrimary) {
        // Clear existing primary
        doctor.isPrimary = false;
      }
    }

    if (!targetDoctor) return false;

    targetDoctor.isPrimary = true;
    logger.info('Set primary doctor', { hospital: hospitalName, doctor: doctorName });
    return true;
  }

  // ========== Statistics ==========

  getStats(): { totalHospitals: number; totalDepartments: number; totalDoctors: number; primary: string | null; cacheSize: number } {
    let totalDepartments = 0;
    for (const deptSet of Array.from(this.departments.values())) {
      totalDepartments += deptSet.size;
    }

    const primary = this.getPrimary();

    return {
      totalHospitals: this.hospitals.size,
      totalDepartments,
      totalDoctors: this.doctors.size,
      primary: primary?.name || null,
      cacheSize: this.newsCache.size,
    };
  }

  // ========== Lifecycle ==========

  close(): void {
    this.hospitals.clear();
    this.departments.clear();
    this.doctors.clear();
    this.newsCache.clear();
    logger.info('MemorySubscriptionDatabase closed');
  }
}
