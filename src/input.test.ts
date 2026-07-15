import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeeds, normalizeInput } from './input.js';

test('normalizeInput trims and deduplicates queries and topics', () => {
    const input = normalizeInput({
        queries: ['  Artificial   Intelligence ', 'artificial intelligence'],
        topics: ['technology', 'TECHNOLOGY'],
        country: 'us',
        language: 'EN',
        maxArticlesPerFeed: 5,
    });
    assert.deepEqual(input.queries, ['Artificial Intelligence']);
    assert.deepEqual(input.topics, ['TECHNOLOGY']);
    assert.equal(input.country, 'US');
    assert.equal(input.language, 'en');
    assert.equal(input.maxArticlesPerFeed, 5);
});

test('normalizeInput uses a one-result runtime default', () => {
    const input = normalizeInput({ queries: ['apify'] });
    assert.equal(input.maxArticlesPerFeed, 1);
    assert.equal(input.country, 'US');
    assert.equal(input.language, 'en');
});

test('normalizeInput requires at least one feed target', () => {
    assert.throws(() => normalizeInput({}), /Provide at least one query or topic/);
    assert.doesNotThrow(() => normalizeInput({ topHeadlines: true }));
});

test('normalizeInput rejects unknown and malformed fields', () => {
    assert.throws(() => normalizeInput({ queries: ['apify'], unknown: true }), /unsupported field/);
    assert.throws(() => normalizeInput({ queries: 'apify' }), /array of strings/);
    assert.throws(() => normalizeInput({ queries: [''] }), /cannot be empty/);
    assert.throws(() => normalizeInput({ queries: ['apify'], topHeadlines: 'yes' }), /must be a boolean/);
});

test('normalizeInput enforces query and result bounds', () => {
    assert.throws(() => normalizeInput({ queries: Array.from({ length: 21 }, (_, index) => `q${index}`) }), /at most 20/);
    assert.throws(() => normalizeInput({ queries: ['x'.repeat(257)] }), /at most 256/);
    assert.throws(() => normalizeInput({ queries: ['apify'], maxArticlesPerFeed: 0 }), /integer from 1 to 100/);
    assert.throws(() => normalizeInput({ queries: ['apify'], maxArticlesPerFeed: 1.5 }), /integer from 1 to 100/);
});

test('normalizeInput restricts topics and locale codes', () => {
    assert.throws(() => normalizeInput({ topics: ['POLITICS'] }), /Unsupported topic/);
    assert.throws(() => normalizeInput({ queries: ['apify'], country: 'USA' }), /two-letter code/);
    assert.throws(() => normalizeInput({ queries: ['apify'], language: 'english' }), /two-letter code/);
});

test('normalizeInput validates proxy editor fields', () => {
    assert.throws(
        () => normalizeInput({ queries: ['apify'], proxyConfiguration: { useApifyProxy: false, apifyProxyGroups: ['RESIDENTIAL'] } }),
        /requires useApifyProxy=true/,
    );
    assert.throws(
        () => normalizeInput({ queries: ['apify'], proxyConfiguration: { proxyUrls: ['ftp://proxy.example'] } }),
        /must use http or https/,
    );
    assert.throws(
        () => normalizeInput({
            queries: ['apify'],
            proxyConfiguration: { useApifyProxy: true, proxyUrls: ['http://proxy.example:8000'] },
        }),
        /cannot combine Apify Proxy with custom proxy URLs/,
    );
    const input = normalizeInput({
        queries: ['apify'],
        proxyConfiguration: { proxyUrls: ['http://user:pass@proxy.example:8000'] },
    });
    assert.deepEqual(input.proxyConfiguration?.proxyUrls, ['http://user:pass@proxy.example:8000']);
});

test('buildFeeds creates encoded top, topic, and search URLs', () => {
    const feeds = buildFeeds(normalizeInput({
        queries: ['AI & safety'],
        topics: ['technology'],
        topHeadlines: true,
        country: 'GB',
        language: 'en',
    }));
    assert.equal(feeds.length, 3);
    assert.equal(new URL(feeds[0].url).pathname, '/rss');
    assert.equal(new URL(feeds[1].url).pathname, '/rss/headlines/section/topic/TECHNOLOGY');
    assert.equal(new URL(feeds[2].url).searchParams.get('q'), 'AI & safety');
    assert.equal(new URL(feeds[2].url).searchParams.get('ceid'), 'GB:en');
});
