import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedFetchError, type FeedClient } from './feed-client.js';
import { normalizeInput } from './input.js';
import { GoogleNewsRunError, scrapeGoogleNews } from './scraper.js';
import type { ArticleRecord, GoogleNewsRunStatus } from './types.js';

const NOW = () => new Date('2026-07-15T00:00:00.000Z');

test('scraper saves and reports validated records', async () => {
    const saved: ArticleRecord[] = [];
    const statuses: GoogleNewsRunStatus[] = [];
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['apify'], maxArticlesPerFeed: 1 }), {
        client: fixedClient(rss('guid-1', 'Article one')),
        saveRecord: async (record) => { saved.push(record); return charge(); },
        writeStatus: async (value) => { statuses.push(value); },
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(saved.length, 1);
    assert.equal(status.status, 'succeeded');
    assert.equal(status.recordsSaved, 1);
    assert.equal(status.requestsMade, 1);
    assert.equal(statuses.length, 1);
});

test('scraper deduplicates overlapping feed records before billing', async () => {
    const saved: ArticleRecord[] = [];
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['apify'], topics: ['TECHNOLOGY'] }), {
        client: fixedClient(rss('same-guid', 'Same article')),
        saveRecord: async (record) => { saved.push(record); return charge(); },
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(saved.length, 1);
    assert.equal(status.duplicatesSkipped, 1);
    assert.equal(status.recordsSaved, 1);
});

test('scraper deduplicates a repeated link even when the GUID changes', async () => {
    let calls = 0;
    const saved: ArticleRecord[] = [];
    const client: FeedClient = {
        fetchXml: async () => {
            calls += 1;
            return { xml: rss(`guid-${calls}`, 'Same link', 'shared-link'), attempts: 1, statusCode: 200 };
        },
    };
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['one', 'two'] }), {
        client,
        saveRecord: async (record) => { saved.push(record); return charge(); },
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(saved.length, 1);
    assert.equal(status.duplicatesSkipped, 1);
});

test('scraper treats valid feeds with no items as an honest empty success', async () => {
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['unlikely-query'] }), {
        client: fixedClient('<rss><channel><title>Empty</title></channel></rss>'),
        saveRecord: async () => charge(),
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(status.status, 'empty');
    assert.equal(status.feedsEmpty, 1);
    assert.equal(status.feedsFailed, 0);
});

test('scraper reports partial success when one feed fails', async () => {
    let calls = 0;
    const client: FeedClient = {
        fetchXml: async () => {
            calls += 1;
            if (calls === 1) throw new FeedFetchError('blocked', 'blocked', 403, 3);
            return { xml: rss('guid-2', 'Recovered article'), attempts: 1, statusCode: 200 };
        },
    };
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['one', 'two'] }), {
        client,
        saveRecord: async () => charge(),
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(status.status, 'partial');
    assert.equal(status.feedsFailed, 1);
    assert.equal(status.recordsSaved, 1);
    assert.equal(status.requestsMade, 4);
});

test('scraper fails visibly when every feed fails', async () => {
    let written: GoogleNewsRunStatus | undefined;
    await assert.rejects(
        scrapeGoogleNews(normalizeInput({ queries: ['apify'] }), {
            client: {
                fetchXml: async () => { throw new FeedFetchError('blocked', 'blocked', 429, 3); },
            },
            saveRecord: async () => charge(),
            writeStatus: async (status) => { written = status; },
            now: NOW,
            nowMs: clock(),
        }),
        (error: unknown) => error instanceof GoogleNewsRunError && error.runStatus.status === 'failed',
    );
    assert.equal(written?.status, 'failed');
    assert.equal(written?.feedsFailed, 1);
    assert.match(written?.failureMessage ?? '', /No articles were saved/);
});

test('scraper stops before another feed after the spending limit', async () => {
    let fetches = 0;
    const client: FeedClient = {
        fetchXml: async () => {
            fetches += 1;
            return { xml: rss(`guid-${fetches}`, `Article ${fetches}`), attempts: 1, statusCode: 200 };
        },
    };
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['one', 'two'] }), {
        client,
        saveRecord: async () => ({ chargedCount: 1, eventChargeLimitReached: true }),
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(status.status, 'stopped_spending_limit');
    assert.equal(status.recordsSaved, 1);
    assert.equal(status.feedsSkipped, 1);
    assert.equal(fetches, 1);
});

test('scraper reports invalid upstream items without charging them', async () => {
    const invalid = '<rss><channel><item><title>Missing publisher</title><link>https://news.google.com/rss/articles/x</link></item></channel></rss>';
    let saves = 0;
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['apify'] }), {
        client: fixedClient(invalid),
        saveRecord: async () => { saves += 1; return charge(); },
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(status.status, 'empty');
    assert.equal(status.invalidItemsSkipped, 1);
    assert.equal(status.feedsEmpty, 1);
    assert.equal(saves, 0);
});

test('scraper does not count an item trimmed by the spending limit as saved', async () => {
    const status = await scrapeGoogleNews(normalizeInput({ queries: ['apify'] }), {
        client: fixedClient(rss('guid-limit', 'Article at limit')),
        saveRecord: async () => ({ chargedCount: 0, eventChargeLimitReached: true }),
        writeStatus: async () => {},
        now: NOW,
        nowMs: clock(),
    });
    assert.equal(status.status, 'stopped_spending_limit');
    assert.equal(status.recordsSaved, 0);
});

function fixedClient(xml: string): FeedClient {
    return { fetchXml: async () => ({ xml, attempts: 1, statusCode: 200 }) };
}

function charge() {
    return { chargedCount: 1, eventChargeLimitReached: false };
}

function clock(): () => number {
    let value = 1_000;
    return () => { value += 25; return value; };
}

function rss(guid: string, title: string, linkId = guid): string {
    return `<rss><channel><item><title>${title} - Example News</title><source url="https://example.com">Example News</source><link>https://news.google.com/rss/articles/${linkId}?oc=5</link><guid>${guid}</guid><pubDate>Wed, 15 Jul 2026 00:00:00 GMT</pubDate><description>${title} Example News</description></item></channel></rss>`;
}
