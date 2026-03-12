import { FastifyInstance } from 'fastify';

/**
 * Repsclaw - OpenClaw Healthcare Plugin
 */
const plugin = {
  id: "repsclaw",
  name: "Repsclaw Healthcare Plugin",
  description: "Healthcare data integration with FDA, PubMed, Clinical Trials, and Medical Terminology APIs",
  
  register(api: { 
    logger: { info: (msg: string) => void };
    registerHttpRoute: (route: {
      path: string;
      auth: string;
      handler: (req: unknown, res: { statusCode: number; end: (data: string) => void }) => boolean | Promise<boolean>;
    }) => void;
  }) {
    api.logger.info("🩺 Repsclaw plugin initializing...");

    // Register health check endpoint
    api.registerHttpRoute({
      path: "/api/repsclaw/health",
      auth: "gateway",
      handler: (_req, res) => {
        res.statusCode = 200;
        res.end(JSON.stringify({
          status: "ok",
          plugin: "repsclaw",
          timestamp: new Date().toISOString(),
        }));
        return true;
      },
    });

    api.logger.info("✅ Repsclaw plugin registered successfully");
  },
};

export default plugin;
