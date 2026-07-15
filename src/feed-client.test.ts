import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedClient, FeedFetchError } from './feed-client.js';
import type { FeedDescriptor } from './types.js';

const FEED: FeedDescriptor = {
    url: 'https://news.google.com/rss/search?q=apify',
    feedType: 'search',
    feedQuery: 'apify',
};
const RSS = '<rss><channel></channel></rss>';

test('feed client sends bounded locale-aware RSS requests', async () => {
    let requestHeaders: Headers | undefined;
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        fetchImpl: fetchStub(async (_input, init) => {
            requestHeaders = new Headers(init?.headers);
            return textResponse(RSS);
        }),
    });
    const result = await client.fetchXml(FEED);
    assert.equal(result.attempts, 1);
    assert.equal(result.statusCode, 200);
    assert.match(requestHeaders?.get('accept') ?? '', /application\/rss\+xml/);
    assert.equal(requestHeaders?.get('accept-language'), 'en-US,en;q=0.9');
});

test('feed client retries throttling and honors Retry-After', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
        fetchImpl: fetchStub(async () => {
            calls += 1;
            return calls === 1
                ? textResponse('busy', 429, { 'retry-after': '2' })
                : textResponse(RSS);
        }),
    });
    const result = await client.fetchXml(FEED);
    assert.equal(result.attempts, 2);
    assert.deepEqual(sleeps, [2_000]);
});

test('feed client retries transient server and network failures', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        sleep: async (milliseconds) => { sleeps.push(milliseconds); },
        fetchImpl: fetchStub(async () => {
            calls += 1;
            if (calls === 1) throw new Error('socket closed');
            if (calls === 2) return textResponse('unavailable', 503);
            return textResponse(RSS);
        }),
    });
    const result = await client.fetchXml(FEED);
    assert.equal(result.attempts, 3);
    assert.deepEqual(sleeps, [500, 2_000]);
});

test('feed client fails non-retryable HTTP responses immediately', async () => {
    let calls = 0;
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        fetchImpl: fetchStub(async () => {
            calls += 1;
            return textResponse('not found', 404);
        }),
    });
    await assert.rejects(client.fetchXml(FEED), (error: unknown) => (
        error instanceof FeedFetchError
        && error.kind === 'invalid_response'
        && error.statusCode === 404
        && error.attempts === 1
    ));
    assert.equal(calls, 1);
});

test('feed client fails empty success responses', async () => {
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        fetchImpl: fetchStub(async () => textResponse('')),
    });
    await assert.rejects(client.fetchXml(FEED), (error: unknown) => (
        error instanceof FeedFetchError && error.kind === 'invalid_response'
    ));
});

test('feed client classifies final timeout failures', async () => {
    const timeout = new Error('deadline');
    timeout.name = 'TimeoutError';
    const client = createFeedClient({
        country: 'US',
        language: 'en',
        maxAttempts: 1,
        fetchImpl: fetchStub(async () => { throw timeout; }),
    });
    await assert.rejects(client.fetchXml(FEED), (error: unknown) => (
        error instanceof FeedFetchError && error.kind === 'timeout'
    ));
});

function textResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(body, { status, headers: { 'content-type': 'application/rss+xml', ...headers } });
}

function fetchStub(
    implementation: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
    return implementation as unknown as typeof fetch;
}
