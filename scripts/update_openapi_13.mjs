/**
 * One-shot script: bumps openapi.json to v1.3.0.
 * Run from repo root: node scripts/update_openapi_13.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', 'docs', 'openapi.json');

const doc = JSON.parse(readFileSync(specPath, 'utf8'));

// ── 1. Bump version ──────────────────────────────────────────────────────────
doc.info.version = '1.3.0';

// ── 2. Add missing tags ──────────────────────────────────────────────────────
const existingTagNames = new Set(doc.tags.map(t => t.name));
for (const name of ['workflow-packs', 'schedules', 'memory']) {
  if (!existingTagNames.has(name)) doc.tags.push({ name });
}

// ── 3. Enrich Task schema ────────────────────────────────────────────────────
const taskSchema = doc.components.schemas.Task;
taskSchema.properties = {
  ...taskSchema.properties,
  description: { type: 'string', nullable: true },
  workflow_pack_key: {
    type: 'string',
    nullable: true,
    description: 'Key of the workflow pack assigned to this task',
  },
  chain_to_task_id: {
    type: 'string',
    nullable: true,
    description: 'ID of another task this task is chained to (SET NULL on delete)',
  },
  workflow_meta_json: {
    type: 'string',
    nullable: true,
    description: 'Arbitrary JSON metadata for workflow orchestration',
  },
  priority: { type: 'integer', default: 0 },
  project_id: { type: 'string', nullable: true },
  assigned_agent_id: { type: 'string', nullable: true },
  created_at: { type: 'integer', description: 'Unix timestamp (ms)' },
  updated_at: { type: 'integer', description: 'Unix timestamp (ms)' },
};

// ── 4. Add component schemas ─────────────────────────────────────────────────
doc.components.schemas.WorkflowPack = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    enabled: { type: 'boolean' },
    is_builtin: { type: 'boolean' },
    system_prompt: { type: 'string', nullable: true },
    qa_rules_json: { type: 'string', nullable: true, description: 'JSON-encoded QA rules' },
  },
  required: ['key', 'name', 'enabled', 'is_builtin'],
};

doc.components.schemas.Schedule = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title_template: { type: 'string' },
    description_template: { type: 'string', nullable: true },
    workflow_pack_key: { type: 'string', nullable: true },
    project_id: { type: 'string', nullable: true },
    assigned_agent_id: { type: 'string', nullable: true },
    workflow_meta_json: { type: 'string', nullable: true },
    priority: { type: 'integer', default: 0 },
    interval_days: { type: 'number' },
    next_trigger_at: { type: 'integer', description: 'Unix timestamp (ms)' },
    last_triggered_at: { type: 'integer', nullable: true },
    enabled: { type: 'boolean' },
    created_at: { type: 'integer' },
  },
  required: ['id', 'title_template', 'interval_days', 'enabled'],
};

doc.components.schemas.ProjectMemory = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    project_id: { type: 'string' },
    agent_id: { type: 'string', nullable: true },
    category: {
      type: 'string',
      enum: ['observation', 'decision', 'blocker', 'preference', 'context'],
    },
    content: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    created_at: { type: 'integer' },
  },
  required: ['id', 'project_id', 'category', 'content', 'confidence'],
};

// ── 5. Add component responses ───────────────────────────────────────────────
doc.components.responses = doc.components.responses ?? {};
doc.components.responses.BadRequestError = {
  description: 'Bad request — invalid input',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};
doc.components.responses.NotFoundError = {
  description: 'Resource not found',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

// ── 6. Helper ────────────────────────────────────────────────────────────────
function jsonBody(schemaRef) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: `#/components/schemas/${schemaRef}` },
      },
    },
  };
}

function jsonResponse(description, schemaOrRef) {
  const schema =
    typeof schemaOrRef === 'string'
      ? { $ref: `#/components/schemas/${schemaOrRef}` }
      : schemaOrRef;
  return {
    description,
    content: { 'application/json': { schema } },
  };
}

function arrayResponse(description, itemRef) {
  return {
    description,
    content: {
      'application/json': {
        schema: { type: 'array', items: { $ref: `#/components/schemas/${itemRef}` } },
      },
    },
  };
}

const noContent = { '204': { description: 'No content' } };
const notFound = { '404': { $ref: '#/components/responses/NotFoundError' } };
const badRequest = { '400': { $ref: '#/components/responses/BadRequestError' } };

// ── 7. Workflow-packs endpoints ──────────────────────────────────────────────
// Add POST to existing /api/workflow-packs path
doc.paths['/api/workflow-packs'].post = {
  summary: 'Create a custom workflow pack',
  operationId: 'createWorkflowPack',
  tags: ['workflow-packs'],
  requestBody: jsonBody('WorkflowPack'),
  responses: {
    '201': jsonResponse('Created', 'WorkflowPack'),
    ...badRequest,
  },
};

// Add GET to /api/workflow-packs (list)
if (!doc.paths['/api/workflow-packs'].get) {
  doc.paths['/api/workflow-packs'].get = {
    summary: 'List all workflow packs',
    operationId: 'listWorkflowPacks',
    tags: ['workflow-packs'],
    responses: {
      '200': arrayResponse('List of workflow packs', 'WorkflowPack'),
    },
  };
}

// /api/workflow-packs/{key}
if (!doc.paths['/api/workflow-packs/{key}']) {
  doc.paths['/api/workflow-packs/{key}'] = {};
}
const packKeyPath = doc.paths['/api/workflow-packs/{key}'];
packKeyPath.delete = {
  summary: 'Delete a custom workflow pack',
  operationId: 'deleteWorkflowPack',
  tags: ['workflow-packs'],
  parameters: [
    { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
  ],
  responses: {
    ...noContent,
    ...notFound,
  },
};

// /api/workflow-packs/{key}/analytics
doc.paths['/api/workflow-packs/{key}/analytics'] = {
  get: {
    summary: 'Get analytics for a single workflow pack',
    operationId: 'getWorkflowPackAnalytics',
    tags: ['workflow-packs'],
    parameters: [
      { name: 'key', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': jsonResponse('Analytics data', {
        type: 'object',
        properties: {
          pack_key: { type: 'string' },
          total_tasks: { type: 'integer' },
          completed_tasks: { type: 'integer' },
          average_peer_review_score: { type: 'number', nullable: true },
          last_used_at: { type: 'integer', nullable: true },
        },
        additionalProperties: true,
      }),
      ...notFound,
    },
  },
};

// ── 8. Schedules endpoints ───────────────────────────────────────────────────
doc.paths['/api/schedules'] = {
  get: {
    summary: 'List all task schedules',
    operationId: 'listSchedules',
    tags: ['schedules'],
    parameters: [
      {
        name: 'enabled',
        in: 'query',
        required: false,
        schema: { type: 'boolean' },
        description: 'Filter by enabled flag',
      },
    ],
    responses: {
      '200': arrayResponse('List of schedules', 'Schedule'),
    },
  },
  post: {
    summary: 'Create a new recurring schedule',
    operationId: 'createSchedule',
    tags: ['schedules'],
    requestBody: jsonBody('Schedule'),
    responses: {
      '201': jsonResponse('Created schedule', 'Schedule'),
      ...badRequest,
    },
  },
};

doc.paths['/api/schedules/{id}'] = {
  put: {
    summary: 'Update a schedule',
    operationId: 'updateSchedule',
    tags: ['schedules'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: jsonBody('Schedule'),
    responses: {
      '200': jsonResponse('Updated schedule', 'Schedule'),
      ...notFound,
      ...badRequest,
    },
  },
  delete: {
    summary: 'Delete a schedule',
    operationId: 'deleteSchedule',
    tags: ['schedules'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      ...noContent,
      ...notFound,
    },
  },
};

doc.paths['/api/schedules/{id}/trigger'] = {
  post: {
    summary: 'Manually trigger a schedule immediately',
    operationId: 'triggerSchedule',
    tags: ['schedules'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': jsonResponse('Triggered task', 'Task'),
      ...notFound,
    },
  },
};

// ── 9. Project memory endpoints ──────────────────────────────────────────────
doc.paths['/api/projects/{id}/memory'] = {
  get: {
    summary: 'List memory entries for a project',
    operationId: 'listProjectMemory',
    tags: ['memory'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      {
        name: 'category',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: ['observation', 'decision', 'blocker', 'preference', 'context'],
        },
      },
    ],
    responses: {
      '200': arrayResponse('List of memory entries', 'ProjectMemory'),
      ...notFound,
    },
  },
};

doc.paths['/api/projects/{id}/memory/{memoryId}'] = {
  delete: {
    summary: 'Delete a specific project memory entry',
    operationId: 'deleteProjectMemoryEntry',
    tags: ['memory'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'memoryId', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      ...noContent,
      ...notFound,
    },
  },
};

// ── 10. Task output endpoints ────────────────────────────────────────────────
doc.paths['/api/tasks/{id}/output'] = {
  get: {
    summary: 'List output files for a task',
    operationId: 'listTaskOutput',
    tags: ['tasks'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': jsonResponse('Output file listing', {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                size: { type: 'integer' },
                modified_at: { type: 'integer' },
              },
              required: ['filename', 'size', 'modified_at'],
            },
          },
        },
        required: ['taskId', 'files'],
      }),
      ...notFound,
    },
  },
};

doc.paths['/api/tasks/{id}/output/{filename}'] = {
  get: {
    summary: 'Download a specific task output file',
    operationId: 'getTaskOutputFile',
    tags: ['tasks'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Raw file content',
        content: {
          'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          'text/plain': { schema: { type: 'string' } },
          'application/json': { schema: { type: 'object', additionalProperties: true } },
        },
      },
      ...notFound,
    },
  },
};

// ── 11. Enrich /api/health response schema ───────────────────────────────────
const healthGet = doc.paths['/api/health']?.get;
if (healthGet?.responses?.['200']) {
  healthGet.responses['200'] = {
    description: 'Service health payload',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            app: { type: 'string' },
            uptime_seconds: { type: 'number' },
            database: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                tables: { type: 'integer', description: 'Number of user tables in the DB' },
                active_processes: {
                  type: 'integer',
                  description: 'Count of active CLI processes',
                },
              },
              required: ['ok', 'tables', 'active_processes'],
            },
          },
          required: ['status', 'timestamp', 'version', 'uptime_seconds', 'database'],
        },
        example: {
          status: 'ok',
          timestamp: '2026-01-01T00:00:00.000Z',
          version: '1.3.0',
          app: 'Claw-Empire',
          uptime_seconds: 3600,
          database: { ok: true, tables: 22, active_processes: 3 },
        },
      },
    },
  };
}

// ── 12. Write back ───────────────────────────────────────────────────────────
writeFileSync(specPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('openapi.json updated to v1.3.0');
console.log('Paths added:');
const newPaths = [
  '/api/workflow-packs POST',
  '/api/workflow-packs/{key} DELETE',
  '/api/workflow-packs/{key}/analytics GET',
  '/api/schedules GET+POST',
  '/api/schedules/{id} PUT+DELETE',
  '/api/schedules/{id}/trigger POST',
  '/api/projects/{id}/memory GET',
  '/api/projects/{id}/memory/{memoryId} DELETE',
  '/api/tasks/{id}/output GET',
  '/api/tasks/{id}/output/{filename} GET',
];
newPaths.forEach(p => console.log(' ', p));
