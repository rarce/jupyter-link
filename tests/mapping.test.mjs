import { describe, test, expect } from 'vitest';
import { mapIopubToOutput, isStatusIdle, makeExecuteRequest } from '../scripts/jupyter_proto.mjs';

describe('iopub mapping', () => {
  test('stream', () => {
    const msg = { header: { msg_type: 'stream' }, content: { name: 'stdout', text: 'hello' } };
    expect(mapIopubToOutput(msg)).toEqual({ output_type: 'stream', name: 'stdout', text: 'hello' });
  });
  test('execute_result', () => {
    const msg = { header: { msg_type: 'execute_result' }, content: { execution_count: 3, data: { 'text/plain': '3' }, metadata: {} } };
    expect(mapIopubToOutput(msg)).toEqual({ output_type: 'execute_result', execution_count: 3, data: { 'text/plain': '3' }, metadata: {} });
  });
  test('display_data', () => {
    const msg = { header: { msg_type: 'display_data' }, content: { data: { 'text/plain': 'x' }, metadata: {} } };
    expect(mapIopubToOutput(msg)).toEqual({ output_type: 'display_data', data: { 'text/plain': 'x' }, metadata: {} });
  });
  test('error', () => {
    const msg = { header: { msg_type: 'error' }, content: { ename: 'E', evalue: 'boom', traceback: ['t'] } };
    expect(mapIopubToOutput(msg)).toEqual({ output_type: 'error', ename: 'E', evalue: 'boom', traceback: ['t'] });
  });
  test('status idle', () => {
    const idle = { header: { msg_type: 'status' }, content: { execution_state: 'idle' } };
    expect(isStatusIdle(idle)).toBe(true);
  });
});

