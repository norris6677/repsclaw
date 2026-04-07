/**
 * Subscription Database Interface
 * Abstract interface for subscription storage to allow both Markdown file and in-memory implementations
 */

import type { HospitalNewsItem } from '../types/hospital-news.types';

export interface HospitalSubscriptionDB {
  id?: number;
  name: string;
  isPrimary: boolean;
  subscribedAt: string;
  lastPromptedDate: string | null;
  lastQueryAt: string | null;
  departments?: string[];
}

export interface DoctorSubscriptionDB {
  id?: number;
  name: string;
  hospital: string;
  department?: string;
  isPrimary: boolean;
  subscribedAt: string;
}

export interface ISubscriptionDatabase {
  // Hospital subscription management
  subscribe(name: string, isPrimary?: boolean): HospitalSubscriptionDB;
  unsubscribe(name: string): boolean;
  getAll(): HospitalSubscriptionDB[];
  getById(id: number): HospitalSubscriptionDB | null;
  getByName(name: string): HospitalSubscriptionDB | null;
  getPrimary(): HospitalSubscriptionDB | null;
  setPrimary(name: string): boolean;
  isSubscribed(name: string): boolean;
  getCount(): number;

  // Department subscription management
  subscribeDepartment(hospitalName: string, department: string): { success: boolean; isExisting: boolean };
  unsubscribeDepartment(hospitalName: string, department?: string): { success: boolean; removedAll: boolean };
  getDepartments(hospitalName: string): string[] | null;
  isDepartmentSubscribed(hospitalName: string, department: string): boolean;

  // Doctor subscription management
  subscribeDoctor(hospitalName: string, doctorName: string, department?: string): { success: boolean; isExisting: boolean };
  unsubscribeDoctor(hospitalName: string, doctorName: string): boolean;
  getDoctors(hospitalName?: string): DoctorSubscriptionDB[];
  getPrimaryDoctor(): DoctorSubscriptionDB | null;
  isDoctorSubscribed(hospitalName: string, doctorName: string): boolean;
  setPrimaryDoctor(hospitalName: string, doctorName: string): boolean;

  // Prompt date management
  getLastPromptedDate(): string | null;
  updateLastPromptedDate(): void;
  hasPromptedToday(): boolean;

  // News query time management (for incremental updates)
  updateLastQueryTime(hospitalName: string): void;
  getLastQueryTime(hospitalName: string): string | null;

  // News cache management
  getCachedNews(hospitalName: string, since?: Date): any[];
  cacheNews(items: any[]): void;
  cleanExpiredCache(maxAgeHours?: number): number;

  // Statistics
  getStats(): { totalHospitals: number; totalDepartments: number; totalDoctors: number; primary: string | null; cacheSize: number };

  // Lifecycle
  close(): void;
}
