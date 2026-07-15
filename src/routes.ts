import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ArticleRecord, FeedDescriptor, FeedParseResult } from './types.js';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
});

export class FeedParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FeedParseError';
    }
}

/** Parse and validate a Google News RSS document into billable article records. */
export function parseFeed(
    xml: string,
    feed: FeedDescriptor,
    context: { country: string; language: string },
    limit: number,
    now: () => Date = () => new Date(),
): FeedParseResult {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new FeedParseError('Feed record limit must be an integer from 1 to 100.');
    }
    if (XMLValidator.validate(xml) !== true) {
        throw new FeedParseError(`Google News returned malformed XML for ${feed.feedType} "${feed.feedQuery}".`);
    }

    let document: unknown;
    try {
        document = parser.parse(xml) as unknown;
    } catch {
        throw new FeedParseError(`Google News returned malformed XML for ${feed.feedType} "${feed.feedQuery}".`);
    }

    const root = objectValue(document);
    const rss = objectValue(root?.rss);
    const channel = firstObject(rss?.channel);
    if (!channel) {
        throw new FeedParseError(`Google News response was not an RSS feed for ${feed.feedType} "${feed.feedQuery}".`);
    }

    const items = arrayValue(channel.item);
    const records: ArticleRecord[] = [];
    let invalidItemsSkipped = 0;
    const scrapedAt = now().toISOString();

    for (const value of items) {
        if (records.length >= limit) break;
        const item = objectValue(value);
        const record = item ? mapItem(item, feed, context, scrapedAt) : null;
        if (!record) {
            invalidItemsSkipped += 1;
            continue;
        }
        records.push(record);
    }

    return { records, itemsSeen: items.length, invalidItemsSkipped };
}

export function isValidArticleRecord(record: ArticleRecord): boolean {
    return Boolean(
        record.title
        && record.source
        && isGoogleNewsUrl(record.link)
        && (!record.sourceUrl || isHttpUrl(record.sourceUrl))
        && (!record.publishedAt || isIsoDate(record.publishedAt))
        && isIsoDate(record.scrapedAt)
        && ['search', 'topic', 'top'].includes(record.feedType),
    );
}

function mapItem(
    item: Record<string, unknown>,
    feed: FeedDescriptor,
    context: { country: string; language: string },
    scrapedAt: string,
): ArticleRecord | null {
    const rawTitle = cleanText(textValue(item.title), 1_000);
    const sourceValue = item.source;
    const sourceObject = objectValue(sourceValue);
    const source = cleanText(sourceObject ? textValue(sourceObject['#text']) : textValue(sourceValue), 300);
    const link = cleanUrl(textValue(item.link), true);
    if (!rawTitle || !source || !link) return null;

    const titleSuffix = ` - ${source}`;
    const title = rawTitle.endsWith(titleSuffix)
        ? rawTitle.slice(0, -titleSuffix.length).trim()
        : rawTitle;
    if (!title) return null;

    const sourceUrl = cleanUrl(sourceObject ? textValue(sourceObject['@_url']) : null, false);
    const description = stripHtml(textValue(item.description));
    const snippet = isRepeatedDescription(description, title, source) ? null : cleanText(description, 5_000);
    const record: ArticleRecord = {
        title,
        source,
        sourceUrl,
        link,
        guid: cleanText(textValue(item.guid), 4_096),
        publishedAt: toIso(textValue(item.pubDate)),
        snippet,
        feedType: feed.feedType,
        feedQuery: feed.feedQuery,
        country: context.country,
        language: context.language,
        scrapedAt,
    };
    return isValidArticleRecord(record) ? record : null;
}

function stripHtml(value: string | null): string | null {
    if (!value) return null;
    let text = value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
    for (let iteration = 0; iteration < 2; iteration += 1) text = decodeEntities(text);
    return cleanText(text, 5_000);
}

function decodeEntities(value: string): string {
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(Number.parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(Number.parseInt(code, 10)))
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&apos;|&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&');
}

function safeCodePoint(value: number): string {
    try {
        return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    } catch {
        return '';
    }
}

function isRepeatedDescription(value: string | null, title: string, source: string): boolean {
    if (!value) return false;
    const normalized = normalizeComparable(value);
    return normalized === normalizeComparable(title)
        || normalized === normalizeComparable(`${title} ${source}`)
        || normalized === normalizeComparable(`${title} - ${source}`);
}

function toIso(value: string | null): string | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function cleanUrl(value: string | null, googleNewsOnly: boolean): string | null {
    if (!value || value.length > 4_096) return null;
    try {
        const parsed = new URL(value.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        if (googleNewsOnly && parsed.hostname !== 'news.google.com') return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function isGoogleNewsUrl(value: string): boolean {
    return cleanUrl(value, true) !== null;
}

function isHttpUrl(value: string): boolean {
    return cleanUrl(value, false) !== null;
}

function isIsoDate(value: string): boolean {
    return !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function cleanText(value: string | null, maximumLength: number): string | null {
    if (!value) return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized ? normalized.slice(0, maximumLength) : null;
}

function normalizeComparable(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

function textValue(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const object = objectValue(value);
    return object ? textValue(object['#text']) : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function firstObject(value: unknown): Record<string, unknown> | null {
    const candidate = Array.isArray(value) ? value[0] : value;
    return objectValue(candidate);
}

function arrayValue(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}
