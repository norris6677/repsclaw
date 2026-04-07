#!/usr/bin/env tsx
/**
 * Virtual Test Server
 * Standalone HTTP server for testing without full OpenClaw environment
 * Uses Markdown file storage
 */

import * as http from 'http';
import * as path from 'path';
import { parse } from 'url';
import { TextDecoder } from 'util';
import { getMinimalAPI, resetMinimalAPI } from './minimal-api';
import { HospitalNewsService } from '../../../src/services/hospital-news/hospital-news.service';
import { HospitalSubscriptionService } from '../../../src/services/hospital-subscription.service';
import { DoctorSubscriptionService } from '../../../src/services/doctor-subscription.service';
import { createLogger } from '../../../src/utils/plugin-logger';
import type { MinimalOpenClawAPI } from './test-server.types';

const logger = createLogger('REPSCLAW:VIRTUAL-SERVER');

interface VirtualTestServerOptions {
  port: number;
  host: string;
}

/**
 * Virtual Test Server
 * Creates a minimal HTTP server with plugin routes registered
 */
export class VirtualTestServer {
  private server: http.Server | null = null;
  private api: ReturnType<typeof getMinimalAPI>;
  private hospitalNewsService: HospitalNewsService;
  private subscriptionService: HospitalSubscriptionService;
  private doctorSubscriptionService: DoctorSubscriptionService;
  private options: VirtualTestServerOptions;

  constructor(options: VirtualTestServerOptions) {
    this.options = options;

    // Create services (using file storage for persistence across requests)
    this.subscriptionService = new HospitalSubscriptionService();
    this.doctorSubscriptionService = new DoctorSubscriptionService(this.subscriptionService);
    this.hospitalNewsService = new HospitalNewsService();

    // Get minimal API
    this.api = getMinimalAPI();

    // Setup custom request handler
    this.setupRequestHandler();
  }

  /**
   * Setup HTTP request handler
   */
  private setupRequestHandler(): void {
    this.server = http.createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
      }

      // Parse request body for POST/PUT
      let body: unknown = undefined;
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this.parseBody(req);
      }

      // Attach parsed body to request
      (req as any).parsedBody = body;

      // Try to handle with registered routes
      const handled = await this.api.handleRequest(req, res);
      if (handled) {
        return;
      }

      // 404 Not Found
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'error',
        error: {
          code: 'NOT_FOUND',
          message: `Route not found: ${req.url}`,
        },
      }));
    });
  }

  /**
   * Parse request body
   */
  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString();
          if (!body) {
            resolve(undefined);
            return;
          }
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve(JSON.parse(body));
          } else {
            resolve(body);
          }
        } catch {
          resolve(undefined);
        }
      });
    });
  }

  /**
   * Register all plugin routes manually (without full plugin registration)
   */
  async initialize(): Promise<void> {
    logger.info('Initializing virtual test server...');

    // Register health check routes
    this.registerHealthRoutes();

    // Register hospital subscription routes
    this.registerHospitalSubscriptionRoutes();

    // Register doctor subscription routes
    this.registerDoctorSubscriptionRoutes();

    // Register hospital news routes
    this.registerHospitalNewsRoutes();

    logger.info('Virtual test server initialized');
  }

  /**
   * Register health check routes
   */
  private registerHealthRoutes(): void {
    // Main endpoint
    this.api.registerHttpRoute({
      path: '/api/repsclaw',
      auth: 'gateway',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          name: 'repsclaw',
          version: '2.0.0-virtual',
          description: 'Healthcare data integration plugin (virtual test mode)',
          mode: 'virtual',
          endpoints: [
            '/api/repsclaw/health',
            '/api/repsclaw/hospitals',
            '/api/repsclaw/hospitals/subscribe',
            '/api/repsclaw/hospitals/unsubscribe',
            '/api/repsclaw/hospitals/list',
            '/api/repsclaw/hospitals/news',
            '/api/repsclaw/doctors/subscribe',
            '/api/repsclaw/doctors/unsubscribe',
            '/api/repsclaw/doctors/list',
            '/api/repsclaw/doctors/status',
            '/api/repsclaw/doctors/set-primary',
          ],
        }));
        return true;
      },
    });

    // Health check
    this.api.registerHttpRoute({
      path: '/api/repsclaw/health',
      auth: 'gateway',
      handler: (_req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'ok',
          plugin: 'repsclaw',
          version: '2.0.0-virtual',
          mode: 'virtual',
          timestamp: new Date().toISOString(),
        }));
        return true;
      },
    });
  }

  /**
   * Register hospital subscription routes
   */
  private registerHospitalSubscriptionRoutes(): void {
    // Get hospitals
    this.api.registerHttpRoute({
      path: '/api/repsclaw/hospitals',
      auth: 'gateway',
      handler: (_req, res) => {
        const hospitals = this.subscriptionService.getHospitals();
        const primary = this.subscriptionService.getPrimaryHospital();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'success',
          data: {
            hospitals,
            primary: primary?.name || null,
            totalCount: hospitals.length,
          },
        }));
        return true;
      },
    });

    // List hospitals
    this.api.registerHttpRoute({
      path: '/api/repsclaw/hospitals/list',
      auth: 'gateway',
      handler: (_req, res) => {
        const hospitals = this.subscriptionService.getHospitals();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'success',
          data: hospitals,
        }));
        return true;
      },
    });

    // Subscribe
    this.api.registerHttpRoute({
      path: '/api/repsclaw/hospitals/subscribe',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const name = query.name as string;
        if (!name) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_NAME', message: 'Hospital name is required' },
          }));
          return true;
        }

        const isPrimary = query.isPrimary === 'true';
        const subscription = this.subscriptionService.subscribe(name, isPrimary);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'success',
          data: { subscription },
        }));
        return true;
      },
    });

    // Unsubscribe
    this.api.registerHttpRoute({
      path: '/api/repsclaw/hospitals/unsubscribe',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const name = query.name as string;
        if (!name) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_NAME', message: 'Hospital name is required' },
          }));
          return true;
        }

        const success = this.subscriptionService.unsubscribe(name);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: success ? 'success' : 'error',
          data: { removed: success },
        }));
        return true;
      },
    });
  }

  /**
   * Register doctor subscription routes
   */
  private registerDoctorSubscriptionRoutes(): void {
    // List doctors
    this.api.registerHttpRoute({
      path: '/api/repsclaw/doctors/list',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;
        const hospitalName = query.hospitalName as string | undefined;

        const doctors = hospitalName
          ? this.doctorSubscriptionService.getDoctorsByHospital(hospitalName)
          : this.doctorSubscriptionService.getDoctors();
        const primary = this.doctorSubscriptionService.getPrimaryDoctor();
        const stats = this.doctorSubscriptionService.getStats();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'success',
          data: {
            doctors,
            primary: primary || null,
            totalCount: stats.total,
          },
        }));
        return true;
      },
    });

    // Subscribe doctor
    this.api.registerHttpRoute({
      path: '/api/repsclaw/doctors/subscribe',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const hospitalName = query.hospitalName as string;
        const doctorName = query.doctorName as string;
        const department = query.department as string | undefined;

        if (!hospitalName || !doctorName) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_PARAMS', message: 'Hospital name and doctor name are required' },
          }));
          return true;
        }

        const result = this.doctorSubscriptionService.subscribe(
          hospitalName,
          doctorName,
          department,
          false
        );

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: result.success ? 'success' : 'error',
          data: { subscription: result.subscription },
          error: result.success ? undefined : { message: result.error },
        }));
        return true;
      },
    });

    // Unsubscribe doctor
    this.api.registerHttpRoute({
      path: '/api/repsclaw/doctors/unsubscribe',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const hospitalName = query.hospitalName as string;
        const doctorName = query.doctorName as string;

        if (!hospitalName || !doctorName) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_PARAMS', message: 'Hospital name and doctor name are required' },
          }));
          return true;
        }

        const result = this.doctorSubscriptionService.unsubscribe(hospitalName, doctorName);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: result.success ? 'success' : 'error',
          data: { removed: result.success },
          error: result.success ? undefined : { message: result.error },
        }));
        return true;
      },
    });

    // Get status
    this.api.registerHttpRoute({
      path: '/api/repsclaw/doctors/status',
      auth: 'gateway',
      handler: (_req, res) => {
        const stats = this.doctorSubscriptionService.getStats();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'success',
          data: {
            totalDoctors: stats.totalDoctors,
            byHospital: stats.byHospital,
          },
        }));
        return true;
      },
    });

    // Set primary
    this.api.registerHttpRoute({
      path: '/api/repsclaw/doctors/set-primary',
      auth: 'gateway',
      handler: (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const hospitalName = query.hospitalName as string;
        const doctorName = query.doctorName as string;

        if (!hospitalName || !doctorName) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_PARAMS', message: 'Hospital name and doctor name are required' },
          }));
          return true;
        }

        const result = this.doctorSubscriptionService.setPrimary(hospitalName, doctorName);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: result.success ? 'success' : 'error',
          data: { primary: result.success ? { hospital: hospitalName, name: doctorName } : null },
          error: result.success ? undefined : { message: result.error },
        }));
        return true;
      },
    });
  }

  /**
   * Register hospital news routes
   */
  private registerHospitalNewsRoutes(): void {
    this.api.registerHttpRoute({
      path: '/api/repsclaw/hospitals/news',
      auth: 'gateway',
      handler: async (req, res) => {
        const parsedUrl = parse(req.url || '', true);
        const query = parsedUrl.query;

        const hospitalName = query.hospitalName as string;

        if (!hospitalName) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { code: 'INVALID_PARAMS', message: 'Hospital name is required' },
          }));
          return true;
        }

        // Parse sources
        let sources: string[] | undefined;
        if (query.sources) {
          sources = (query.sources as string).split(',');
        }

        try {
          const result = await this.hospitalNewsService.getNews({
            hospitalName,
            sources: sources as any,
            days: query.days ? parseInt(query.days as string, 10) : 7,
            maxResults: query.maxResults ? parseInt(query.maxResults as string, 10) : 10,
            keywords: query.keywords as string | undefined,
            includeContent: query.includeContent === 'true',
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: result.status,
            data: result,
            error: result.status === 'error' ? { message: 'Failed to fetch news' } : undefined,
          }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'error',
            error: { message: error instanceof Error ? error.message : String(error) },
          }));
        }
        return true;
      },
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(this.options.port, this.options.host, () => {
        logger.info(`Virtual test server started at http://${this.options.host}:${this.options.port}`);
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        logger.info('Virtual test server stopped');
        resetMinimalAPI();
        resolve();
      });
    });
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://${this.options.host}:${this.options.port}`;
  }
}
