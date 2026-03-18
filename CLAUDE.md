# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Directory

**All development must be done in `/home/tony203/repsclaw/`**

❌ Never modify files in `~/.openclaw/extensions/repsclaw/` - this is the runtime plugin directory.

Workflow:
1. Develop → `/home/tony203/repsclaw/` (modify code)
2. Test → `/home/tony203/repsclaw/` (run tests)
3. Build → `npm run build` (in dev directory)
4. Deploy → `./deploy.sh` (syncs to plugin directory)

## Common Commands

```bash
# Development
npm run dev              # Watch mode with tsx
npm run build            # Compile to dist/
npm start                # Run compiled output

# Testing (selective - see Testing Policy below)
npm run test:unit                    # Run all unit tests
npm run test:unit:pubmed             # Run single API test
npm run test:api:real                # Run real API integration tests
npm run test:mount                   # Test plugin mounting
npm run test:integration             # Run integration tests

# Linting
npm run lint             # ESLint check
```

## Testing Policy

- **Only test modified APIs** - do not run full test suites unless explicitly requested
- **Use mock tests by default** - do not run `tests/integration/api/*.real.test.ts` unless explicitly requested
- **Single test execution**: `tsx tests/unit/api/<name>.client.test.ts`

## Architecture Overview

Repsclaw is an **OpenClaw Plugin** that registers tools for LLM function calling.

### Plugin Registration Flow

```
index.ts (plugin object)
├── register(api)           # Called by OpenClaw core
│   ├── registerHealthRoutes(api)      # HTTP endpoints
│   ├── registerAllAPIRoutes(api)      # FDA, PubMed, etc.
│   ├── registerHospitalSubscriptionRoutes(api)
│   ├── registerTools(api)             # Function calling tools
│   ├── registerHospitalSubscriptionTools(api)
│   └── registerHospitalNewsTools(api)
```

### Tool Registration Pattern

Tools are defined in `src/tools/*.tool.ts` with this structure:

```typescript
// 1. Zod Schema for parameters
export const ParametersSchema = z.object({ ... });

// 2. Tool definition (metadata)
export const ToolName = {
  name: 'tool_name',
  description: 'Detailed description for LLM',
  parameters: zodToJsonSchema(ParametersSchema),
};

// 3. Handler factory
export function createHandler(service) {
  return async (args) => {
    const params = ParametersSchema.parse(args);
    return service.query(params);
  };
}
```

Registration in `index.ts`:
```typescript
api.registerTool({
  name: ToolName.name,
  description: ToolName.description,
  parameters: ToolName.parameters,
  handler: createHandler(service),
});
```

### Service Architecture

```
services/
├── hospital-news/              # Multi-source news aggregation
│   ├── hospital-news.service.ts    # Orchestrator with caching
│   ├── hospital-self-news.client.ts # Scrapes top 100 hospital sites
│   ├── official-news.client.ts      # Govt sites (NHC, NMPA)
│   └── mainstream-news.client.ts    # Juhe News API
├── hospital-subscription.service.ts  # In-memory subscription store
└── health-api.service.ts             # FDA/PubMed/etc. clients
```

### Data Flow: Hospital News Query

1. `HospitalNameResolver` normalizes input name to canonical form
2. `HospitalNewsService.getNews()` checks cache (2h TTL)
3. Parallel queries to `NewsSourceClient` implementations
4. Results aggregated, deduplicated (URL + title), sorted (priority > relevance > time)
5. Response cached and returned

### Key Design Patterns

- **Abstract Base Class**: `NewsSourceClient` defines interface for all news sources
- **Priority-based Sorting**: Sources ranked (hospital_self=1, official=2, mainstream=3)
- **Rate Limiting**: Client-level request throttling in `src/utils/rate-limiter.ts`
- **Tool/Route Parity**: Each capability exposed as both HTTP route and function tool

## Environment Variables

Required for real API calls (mock tests don't need these):
- `FDA_API_KEY` - FDA drug API
- `PUBMED_API_KEY` / `NCBI_API_KEY` - PubMed/NCBI APIs
- `JUHE_NEWS_API_KEY` - Mainstream news aggregation

## Deployment Constraints

- **Feishu Mode**: Uses `"openclaw": { "extensions": ["./index.ts"] }` in package.json
- **No `main` field** in openclaw.plugin.json
- **No symlinks** for deployment
- Build output goes to `dist/` which is synced to plugin directory
