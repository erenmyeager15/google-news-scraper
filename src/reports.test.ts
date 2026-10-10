import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeInput } from './input.js';
import { enrichArticleRecord } from './monitoring.js';
import { buildMonitorSummary, monitorCsv, monitorMarkdown } from './reports.js';
import type { ArticleRecord } from './types.js';

test('reports summarize source diversity and protect CSV consumers from formulas', () => {
    const input = normalizeInput({ queries: ['AI'], monitorName: 'AI watch' });
    const rows = [
        enrichArticleRecord(article({ title: '=IMPORTXML("bad")', guid: '1' }), input, null, 0, false),
        enrichArticleRecord(article({ source: 'Other News', sourceUrl: 'https://other.example/', guid: '2' }), input, null, 0, false),
    ];
    const summary = buildMonitorSummary(rows, input.monitorName, input.trackChanges);
    assert.equal(summary.total, 2);
    assert.equal(summary.uniqueSources, 2);
    assert.equal(summary.baseline, 2);
    assert.match(monitorMarkdown(summary, rows), /Sources: 2/);
    assert.match(monitorCsv(rows), /"'=IMPORTXML\(""bad""\)"/);
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
    return {
        title: 'AI update', source: 'Example News', sourceUrl: 'https://example.com/',
        link: 'https://news.google.com/rss/articles/example', guid: 'example',
        publishedAt: '2026-10-09T22:00:00.000Z', snippet: null, feedType: 'search', feedQuery: 'AI', country: 'US',
        language: 'en', scrapedAt: '2026-10-10T00:00:00.000Z', ...overrides,
    };
}
