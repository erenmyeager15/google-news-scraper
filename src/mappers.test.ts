import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedParseError, isValidArticleRecord, parseFeed } from './routes.js';
import type { FeedDescriptor } from './types.js';

const FEED: FeedDescriptor = {
    url: 'https://news.google.com/rss/search?q=apify',
    feedType: 'search',
    feedQuery: 'apify',
};
const CONTEXT = { country: 'US', language: 'en' };
const NOW = () => new Date('2026-07-15T00:00:00.000Z');

const SAMPLE_XML = `<rss><channel>
<item><title>Big News Happens - Example Times</title><source url="https://example.com">Example Times</source><link>https://news.google.com/rss/articles/a?oc=5</link><guid isPermaLink="false">guid-1</guid><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate><description>&lt;a href="https://news.google.com/a"&gt;Big News Happens&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font&gt;Example Times&lt;/font&gt;</description></item>
<item><title>Second &amp; Story - Other Source</title><source url="https://other.example">Other Source</source><link>https://news.google.com/rss/articles/b?oc=5</link><guid>guid-2</guid><pubDate>not-a-date</pubDate><description><![CDATA[<b>Independent &amp; useful</b> context]]></description></item>
<item><title>Missing source</title><link>https://news.google.com/rss/articles/c</link></item>
</channel></rss>`;

test('parseFeed maps current Google News fields and trims the publisher suffix', () => {
    const parsed = parseFeed(SAMPLE_XML, FEED, CONTEXT, 10, NOW);
    assert.equal(parsed.records.length, 2);
    assert.equal(parsed.records[0].title, 'Big News Happens');
    assert.equal(parsed.records[0].source, 'Example Times');
    assert.equal(parsed.records[0].sourceUrl, 'https://example.com/');
    assert.equal(parsed.records[0].guid, 'guid-1');
    assert.equal(parsed.records[0].scrapedAt, '2026-07-15T00:00:00.000Z');
});

test('parseFeed emits only ISO dates and maps malformed dates to null', () => {
    const parsed = parseFeed(SAMPLE_XML, FEED, CONTEXT, 10, NOW);
    assert.equal(parsed.records[0].publishedAt, '2025-01-01T00:00:00.000Z');
    assert.equal(parsed.records[1].publishedAt, null);
});

test('parseFeed removes repeated headline descriptions but keeps unique text', () => {
    const parsed = parseFeed(SAMPLE_XML, FEED, CONTEXT, 10, NOW);
    assert.equal(parsed.records[0].snippet, null);
    assert.equal(parsed.records[1].snippet, 'Independent & useful context');
});

test('parseFeed skips incomplete items and reports parser diagnostics', () => {
    const parsed = parseFeed(SAMPLE_XML, FEED, CONTEXT, 10, NOW);
    assert.equal(parsed.itemsSeen, 3);
    assert.equal(parsed.invalidItemsSkipped, 1);
    assert.equal(parsed.records.length, 2);
});

test('parseFeed applies the result limit after validating items', () => {
    const parsed = parseFeed(SAMPLE_XML, FEED, CONTEXT, 1, NOW);
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].feedType, 'search');
    assert.equal(parsed.records[0].feedQuery, 'apify');
    assert.equal(parsed.records[0].country, 'US');
    assert.equal(parsed.records[0].language, 'en');
});

test('parseFeed rejects HTML and malformed non-RSS responses', () => {
    assert.throws(
        () => parseFeed('<html><body>blocked</body></html>', FEED, CONTEXT, 1, NOW),
        (error: unknown) => error instanceof FeedParseError && /not an RSS feed/.test(error.message),
    );
    assert.throws(() => parseFeed('', FEED, CONTEXT, 1, NOW), FeedParseError);
    assert.throws(() => parseFeed('<rss><channel></rss>', FEED, CONTEXT, 1, NOW), FeedParseError);
});

test('parseFeed does not emit non-Google article links', () => {
    const xml = '<rss><channel><item><title>Title - Source</title><source>Source</source><link>https://evil.example/a</link></item></channel></rss>';
    const parsed = parseFeed(xml, FEED, CONTEXT, 1, NOW);
    assert.equal(parsed.records.length, 0);
    assert.equal(parsed.invalidItemsSkipped, 1);
});

test('isValidArticleRecord rejects invalid output contracts', () => {
    const record = parseFeed(SAMPLE_XML, FEED, CONTEXT, 1, NOW).records[0];
    assert.equal(isValidArticleRecord(record), true);
    assert.equal(isValidArticleRecord({ ...record, link: 'https://example.com/article' }), false);
    assert.equal(isValidArticleRecord({ ...record, scrapedAt: 'yesterday' }), false);
});
