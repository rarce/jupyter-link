import { describe, test, expect } from 'vitest';
import { makeHeader, makeExecuteRequest, mapIopubToOutput, isStatusIdle, isParent } from '../scripts/jupyter_proto.mjs';

describe('makeHeader', () => {
  test('creates header with required fields', () => {
    const h = makeHeader('execute_request', 'session123');
    expect(h.msg_type).toBe('execute_request');
    expect(h.session).toBe('session123');
    expect(h.username).toBe('agent');
    expect(h.version).toBe('5.3');
    expect(h.msg_id).toMatch(/^msg-[a-f0-9]{32}$/);
    expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('uses custom username', () => {
    const h = makeHeader('status', 'sess', 'custom-user');
    expect(h.username).toBe('custom-user');
  });
});

describe('makeExecuteRequest', () => {
  test('creates valid execute_request message', () => {
    const msg = makeExecuteRequest('print(1)', 'sess123');
    expect(msg.header.msg_type).toBe('execute_request');
    expect(msg.header.session).toBe('sess123');
    expect(msg.content.code).toBe('print(1)');
    expect(msg.content.silent).toBe(false);
    expect(msg.content.store_history).toBe(true);
    expect(msg.content.allow_stdin).toBe(false);
    expect(msg.content.stop_on_error).toBe(true);
    expect(msg.channel).toBe('shell');
    expect(msg.parent_header).toEqual({});
    expect(msg.metadata).toEqual({});
  });

  test('respects allow_stdin and stop_on_error params', () => {
    const msg = makeExecuteRequest('x', 's', true, false);
    expect(msg.content.allow_stdin).toBe(true);
    expect(msg.content.stop_on_error).toBe(false);
  });
});

describe('mapIopubToOutput — edge cases', () => {
  test('handles msg_type from header fallback', () => {
    const out = mapIopubToOutput({ header: { msg_type: 'stream' }, content: { name: 'stderr', text: 'err' } });
    expect(out).toEqual({ output_type: 'stream', name: 'stderr', text: 'err' });
  });

  test('returns null for unknown msg_type', () => {
    expect(mapIopubToOutput({ msg_type: 'comm_open', content: {} })).toBeNull();
  });

  test('returns null for status messages', () => {
    expect(mapIopubToOutput({ msg_type: 'status', content: { execution_state: 'idle' } })).toBeNull();
  });

  test('handles missing content fields gracefully', () => {
    const stream = mapIopubToOutput({ msg_type: 'stream', content: {} });
    expect(stream).toEqual({ output_type: 'stream', name: 'stdout', text: '' });

    const result = mapIopubToOutput({ msg_type: 'execute_result', content: {} });
    expect(result.data).toEqual({});
    expect(result.metadata).toEqual({});

    const err = mapIopubToOutput({ msg_type: 'error', content: {} });
    expect(err.ename).toBe('Error');
    expect(err.evalue).toBe('');
    expect(err.traceback).toEqual([]);
  });

  test('display_data includes data and metadata', () => {
    const out = mapIopubToOutput({
      msg_type: 'display_data',
      content: { data: { 'text/html': '<b>hi</b>' }, metadata: { isolated: true } },
    });
    expect(out.output_type).toBe('display_data');
    expect(out.data).toEqual({ 'text/html': '<b>hi</b>' });
    expect(out.metadata).toEqual({ isolated: true });
  });
});

describe('isStatusIdle — edge cases', () => {
  test('false when msg_type is status but execution_state is busy', () => {
    expect(isStatusIdle({ msg_type: 'status', content: { execution_state: 'busy' } })).toBe(false);
  });

  test('falsy when content is missing', () => {
    expect(isStatusIdle({ msg_type: 'status' })).toBeFalsy();
  });

  test('false for non-status msg_type', () => {
    expect(isStatusIdle({ msg_type: 'stream', content: { execution_state: 'idle' } })).toBe(false);
  });

  test('true with header fallback', () => {
    expect(isStatusIdle({ header: { msg_type: 'status' }, content: { execution_state: 'idle' } })).toBe(true);
  });
});

describe('isParent — edge cases', () => {
  test('true when parent_header.msg_id matches', () => {
    expect(isParent({ parent_header: { msg_id: 'abc' } }, 'abc')).toBe(true);
  });

  test('false when msg_id does not match', () => {
    expect(isParent({ parent_header: { msg_id: 'abc' } }, 'xyz')).toBe(false);
  });

  test('falsy when parent_header is missing', () => {
    expect(isParent({}, 'abc')).toBeFalsy();
  });

  test('false when parent_header has no msg_id', () => {
    expect(isParent({ parent_header: {} }, 'abc')).toBe(false);
  });
});
