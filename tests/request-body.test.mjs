import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLimitedBody } from '../lib/request-body.ts';

test('body reader preserves split UTF-8 at the exact byte limit', async () => {
  const bytes = new TextEncoder().encode('{"name":"José"}');
  const stream = new ReadableStream({
    start(c) {
      for (const b of bytes) c.enqueue(new Uint8Array([b]));
      c.close();
    },
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  });
  assert.equal(await readLimitedBody(req, bytes.length), '{"name":"José"}');
});
test('chunked bodies are stopped at the byte limit even without a length header', async () => {
  let cancelled = false,
    reads = 0;
  const stream = new ReadableStream({
    pull(c) {
      reads++;
      c.enqueue(new Uint8Array(1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request('http://localhost', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  });
  assert.equal(req.headers.get('content-length'), null);
  assert.equal(await readLimitedBody(req, 20000), null);
  assert.equal(cancelled, true);
  assert.ok(reads <= 21);
});
test('the body limit counts bytes rather than Unicode characters', async () => {
  assert.equal(
    await readLimitedBody(
      new Request('http://localhost', {
        method: 'POST',
        body: 'é'.repeat(10001),
      }),
    ),
    null,
  );
  assert.equal(await readLimitedBody(new Request('http://localhost')), '');
});
