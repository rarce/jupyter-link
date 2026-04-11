import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

async function loadLocalSchema() {
  const schemaPath = process.env.JUPYTER_API_SCHEMA;
  if (!schemaPath) return null;
  const text = await readFile(schemaPath, 'utf8');
  return YAML.parse(text);
}

describe('OpenAPI schema (optional)', () => {
  test('contains core paths', async () => {
    const schema = await loadLocalSchema();
    if (!schema) return; // skip if not provided
    const paths = schema.paths || {};
    expect(paths['/api/sessions']).toBeDefined();
    expect(paths['/api/contents']).toBeDefined();
    expect(paths['/api/kernels/{kernel_id}/channels']).toBeDefined();
  });
});

