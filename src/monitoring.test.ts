import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeInput } from './input.js';
import {
    appendObservation,
    emptyMonitorMeta,
    enrichArticleRecord,
    monitorStoreName,
    normalizeHistory,
    normalizeMonitorMeta,
} from './monitoring.js';
import type { ArticleObservation, ArticleRecord } from './types.js';

const input = normalizeInput({ queries: ['AI'], monitorName: 'AI watch', maxArticlesPerFeed: 25 });

test('monitoring creates a baseline with freshness and stable story metadata', () => {
    const row = enrichArticleRecord(article(), input, null, 0, false);
    assert.equal(row.monitoringStatus, 'baseline');
    assert.equal(row.observationCount, 1);
    assert.equal(row.ageHours, 2);
    assert.equal(row.freshnessBucket, 'breaking');
    assert.equal(row.publisherDomain, 'example.com');
    assert.match(row.storyClusterId, /^story-[a-f0-9]{16}$/);
});

test('monitoring distinguishes a later new article from the first baseline', () => {
    const row = enrichArticleRecord(article(), input, null, 0, true);
    assert.equal(row.monitoringStatus, 'new');
    assert.equal(row.changeSeverity, 'high');
    assert.deepEqual(row.changeSignals, ['new_article', 'breaking_article']);
});

test('monitoring marks a matching repeat as unchanged and increments its observation count', () => {
    const original = article();
    const baseline = enrichArticleRecord(original, input, null, 0, false);
    const history = appendObservation([], baseline, input.observationHistoryLimit);
    const repeat = enrichArticleRecord(
        article({ scrapedAt: '2026-10-10T01:00:00.000Z' }),
        input,
        history.at(-1) ?? null,
        history.length,
        true,
    );
    assert.equal(repeat.monitoringStatus, 'unchanged');
    assert.equal(repeat.observationCount, 2);
    assert.deepEqual(repeat.changedFields, []);
    assert.deepEqual(repeat.changeSignals, []);
});

test('monitoring detects changed headline and publisher evidence', () => {
    const previous: ArticleObservation = {
        observedAt: '2026-10-09T00:00:00.000Z', title: 'Old title', source: 'Old source',
        sourceUrl: 'https://old.example/', publishedAt: '2026-10-09T20:00:00.000Z', snippet: null,
    };
    const row = enrichArticleRecord(article(), input, previous, 2, true);
    assert.equal(row.monitoringStatus, 'updated');
    assert.equal(row.changeSeverity, 'high');
    assert.ok(row.changeSignals.includes('headline_changed'));
    assert.ok(row.changeSignals.includes('publisher_changed'));
    assert.equal(row.observationCount, 3);
});

test('history and run metadata remain bounded and reject malformed state', () => {
    assert.deepEqual(normalizeMonitorMeta({ completedRuns: -1 }), emptyMonitorMeta());
    const row = enrichArticleRecord(article(), input, null, 8, false, false);
    assert.equal(row.monitoringStatus, 'partial');
    assert.deepEqual(row.changeSignals, ['history_unavailable']);
    const history = appendObservation(Array.from({ length: 5 }, (_, index) => ({
        observedAt: `2026-10-0${index + 1}T00:00:00.000Z`, title: 'Earlier', source: 'Source',
        sourceUrl: null, publishedAt: null, snippet: null,
    })), row, 3);
    assert.equal(history.length, 3);
    assert.equal(history.at(-1)?.title, row.title);
    assert.deepEqual(normalizeHistory([{ observedAt: 'x' }]), []);
    assert.equal(monitorStoreName('AI watch'), monitorStoreName('AI watch'));
});

test('story cluster is insensitive to headline word order on the same publication day', () => {
    const first = enrichArticleRecord(article({ title: 'OpenAI launches a major model today' }), input, null, 0, false);
    const second = enrichArticleRecord(article({ title: 'Today OpenAI launches major model' }), input, null, 0, false);
    assert.equal(first.storyClusterId, second.storyClusterId);
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
    return {
        title: 'OpenAI launches a major model today', source: 'Example News', sourceUrl: 'https://www.example.com/',
        link: 'https://news.google.com/rss/articles/example', guid: 'example-guid',
        publishedAt: '2026-10-09T22:00:00.000Z', snippet: null, feedType: 'search', feedQuery: 'AI', country: 'US',
        language: 'en', scrapedAt: '2026-10-10T00:00:00.000Z', ...overrides,
    };
}
