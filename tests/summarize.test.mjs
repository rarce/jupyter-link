import { describe, test, expect } from 'vitest';
import { summarizeOutput, summarizeCell } from '../src/commands/cell/read.mjs';

describe('summarizeOutput', () => {
  test('stream: joins array text and truncates', () => {
    const out = summarizeOutput({ output_type: 'stream', name: 'stdout', text: ['hello', ' world'] }, 8);
    expect(out).toEqual({ output_type: 'stream', name: 'stdout', text: 'hello wo' });
  });

  test('stream: handles string text', () => {
    const out = summarizeOutput({ output_type: 'stream', name: 'stderr', text: 'error msg' }, 100);
    expect(out.text).toBe('error msg');
  });

  test('stream: handles missing text', () => {
    const out = summarizeOutput({ output_type: 'stream', name: 'stdout' }, 100);
    expect(out.text).toBe('');
  });

  test('execute_result: truncates text mimes', () => {
    const out = summarizeOutput({
      output_type: 'execute_result',
      execution_count: 5,
      data: { 'text/plain': 'long result text here' },
    }, 10);
    expect(out.data['text/plain']).toBe('long resul');
    expect(out.execution_count).toBe(5);
  });

  test('execute_result: replaces image mimes with placeholder', () => {
    const out = summarizeOutput({
      output_type: 'execute_result',
      data: { 'image/png': 'base64data1234567890' },
    }, 100);
    expect(out.data['image/png']).toBe('<20 chars>');
  });

  test('display_data: replaces application/pdf with placeholder', () => {
    const out = summarizeOutput({
      output_type: 'display_data',
      data: { 'application/pdf': 'pdfbytes', 'text/plain': 'figure' },
    }, 100);
    expect(out.data['application/pdf']).toBe('<8 chars>');
    expect(out.data['text/plain']).toBe('figure');
  });

  test('display_data: handles array mime values', () => {
    const out = summarizeOutput({
      output_type: 'display_data',
      data: { 'text/html': ['<div>', 'hello', '</div>'] },
    }, 100);
    expect(out.data['text/html']).toBe('<div>hello</div>');
  });

  test('error: keeps last 5 traceback frames', () => {
    const frames = Array.from({ length: 8 }, (_, i) => `frame ${i}`);
    const out = summarizeOutput({
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad value',
      traceback: frames,
    }, 100);
    expect(out.ename).toBe('ValueError');
    expect(out.evalue).toBe('bad value');
    expect(out.traceback).toHaveLength(5);
    expect(out.traceback[0]).toBe('frame 3');
    expect(out.traceback[4]).toBe('frame 7');
  });

  test('error: truncates each traceback line', () => {
    const out = summarizeOutput({
      output_type: 'error',
      ename: 'E',
      evalue: 'v',
      traceback: ['a'.repeat(100)],
    }, 10);
    expect(out.traceback[0]).toBe('a'.repeat(10));
  });

  test('error: handles missing traceback', () => {
    const out = summarizeOutput({ output_type: 'error', ename: 'E', evalue: 'v' }, 100);
    expect(out.traceback).toEqual([]);
  });

  test('unknown output_type: passes through unchanged', () => {
    const raw = { output_type: 'custom', foo: 'bar' };
    expect(summarizeOutput(raw, 100)).toBe(raw);
  });
});

describe('summarizeCell', () => {
  test('code cell: includes source, outputs, execution_count', () => {
    const cell = {
      cell_type: 'code',
      source: 'print(1)',
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
      execution_count: 3,
    };
    const result = summarizeCell(cell, 5, 100);
    expect(result.index).toBe(5);
    expect(result.cell_type).toBe('code');
    expect(result.source).toBe('print(1)');
    expect(result.execution_count).toBe(3);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].output_type).toBe('stream');
  });

  test('code cell: null execution_count when missing', () => {
    const cell = { cell_type: 'code', source: 'x', outputs: [] };
    expect(summarizeCell(cell, 0, 100).execution_count).toBeNull();
  });

  test('markdown cell: no outputs or execution_count', () => {
    const cell = { cell_type: 'markdown', source: '# Title' };
    const result = summarizeCell(cell, 2, 100);
    expect(result.cell_type).toBe('markdown');
    expect(result.source).toBe('# Title');
    expect(result.outputs).toBeUndefined();
    expect(result.execution_count).toBeUndefined();
  });

  test('handles array source (nbformat style)', () => {
    const cell = { cell_type: 'code', source: ['line1\n', 'line2'], outputs: [] };
    const result = summarizeCell(cell, 0, 100);
    expect(result.source).toBe('line1\nline2');
  });

  test('truncates source to maxChars', () => {
    const cell = { cell_type: 'code', source: 'x'.repeat(200), outputs: [] };
    const result = summarizeCell(cell, 0, 50);
    expect(result.source).toHaveLength(50);
  });

  test('includes agent metadata when present', () => {
    const cell = {
      cell_type: 'code', source: '', outputs: [],
      metadata: { agent: { role: 'jupyter-driver', request_id: 'abc' } },
    };
    const result = summarizeCell(cell, 0, 100);
    expect(result.agent).toEqual({ role: 'jupyter-driver', request_id: 'abc' });
  });

  test('no agent field when metadata.agent is missing', () => {
    const cell = { cell_type: 'code', source: '', outputs: [], metadata: {} };
    expect(summarizeCell(cell, 0, 100).agent).toBeUndefined();
  });
});
