import type { FeedDescriptor, NormalizedInput, ProxyInput } from './types.js';

export const GOOGLE_NEWS_TOPICS = [
    'WORLD',
    'NATION',
    'BUSINESS',
    'TECHNOLOGY',
    'ENTERTAINMENT',
    'SPORTS',
    'SCIENCE',
    'HEALTH',
] as const;

const TOPIC_SET = new Set<string>(GOOGLE_NEWS_TOPICS);
const INPUT_FIELDS = new Set([
    'queries',
    'topics',
    'topHeadlines',
    'country',
    'language',
    'maxArticlesPerFeed',
    'proxyConfiguration',
]);
const PROXY_FIELDS = new Set([
    'useApifyProxy',
    'apifyProxyGroups',
    'apifyProxyCountry',
    'proxyUrls',
]);

export function normalizeInput(value: unknown): NormalizedInput {
    const input = asObject(value, 'Input');
    rejectUnknownFields(input, INPUT_FIELDS, 'Input');

    const queries = normalizeStringArray(input.queries, 'queries', 20, 256);
    const topics = normalizeStringArray(input.topics, 'topics', GOOGLE_NEWS_TOPICS.length, 32)
        .map((topic) => topic.toUpperCase());
    const invalidTopic = topics.find((topic) => !TOPIC_SET.has(topic));
    if (invalidTopic) {
        throw new Error(`Unsupported topic "${invalidTopic}". Use: ${GOOGLE_NEWS_TOPICS.join(', ')}.`);
    }

    const topHeadlines = input.topHeadlines === undefined
        ? false
        : requireBoolean(input.topHeadlines, 'topHeadlines');
    if (queries.length === 0 && topics.length === 0 && !topHeadlines) {
        throw new Error('Provide at least one query or topic, or enable topHeadlines.');
    }

    const country = normalizeLocaleCode(input.country, 'country', 'US', true);
    const language = normalizeLocaleCode(input.language, 'language', 'en', false);
    const maxArticlesPerFeed = input.maxArticlesPerFeed === undefined
        ? 1
        : requireInteger(input.maxArticlesPerFeed, 'maxArticlesPerFeed', 1, 100);
    const proxyConfiguration = normalizeProxyInput(input.proxyConfiguration);

    return {
        queries,
        topics: deduplicate(topics, (topic) => topic),
        topHeadlines,
        country,
        language,
        maxArticlesPerFeed,
        ...(proxyConfiguration ? { proxyConfiguration } : {}),
    };
}

export function buildFeeds(input: NormalizedInput): FeedDescriptor[] {
    const edition = new URLSearchParams({
        hl: `${input.language}-${input.country}`,
        gl: input.country,
        ceid: `${input.country}:${input.language}`,
    });
    const feeds: FeedDescriptor[] = [];

    if (input.topHeadlines) {
        feeds.push({
            url: `https://news.google.com/rss?${edition.toString()}`,
            feedType: 'top',
            feedQuery: 'top headlines',
        });
    }
    for (const topic of input.topics) {
        feeds.push({
            url: `https://news.google.com/rss/headlines/section/topic/${encodeURIComponent(topic)}?${edition.toString()}`,
            feedType: 'topic',
            feedQuery: topic,
        });
    }
    for (const query of input.queries) {
        const parameters = new URLSearchParams(edition);
        parameters.set('q', query);
        feeds.push({
            url: `https://news.google.com/rss/search?${parameters.toString()}`,
            feedType: 'search',
            feedQuery: query,
        });
    }

    return feeds;
}

function normalizeStringArray(
    value: unknown,
    field: string,
    maximumItems: number,
    maximumLength: number,
): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings.`);
    if (value.length > maximumItems) throw new Error(`${field} supports at most ${maximumItems} items.`);

    const normalized = value.map((item, index) => {
        if (typeof item !== 'string') throw new Error(`${field}[${index}] must be a string.`);
        const text = item.replace(/\s+/g, ' ').trim();
        if (!text) throw new Error(`${field}[${index}] cannot be empty.`);
        if (text.length > maximumLength) {
            throw new Error(`${field}[${index}] must be at most ${maximumLength} characters.`);
        }
        return text;
    });
    return deduplicate(normalized, (item) => item.toLocaleLowerCase('en-US'));
}

function normalizeLocaleCode(value: unknown, field: string, fallback: string, uppercase: boolean): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[A-Za-z]{2}$/.test(value.trim())) {
        throw new Error(`${field} must be a two-letter code such as ${field === 'country' ? 'US' : 'en'}.`);
    }
    return uppercase ? value.trim().toUpperCase() : value.trim().toLowerCase();
}

function normalizeProxyInput(value: unknown): ProxyInput | undefined {
    if (value === undefined) return undefined;
    const proxy = asObject(value, 'proxyConfiguration');
    rejectUnknownFields(proxy, PROXY_FIELDS, 'proxyConfiguration');

    const useApifyProxy = proxy.useApifyProxy === undefined
        ? false
        : requireBoolean(proxy.useApifyProxy, 'proxyConfiguration.useApifyProxy');
    const apifyProxyGroups = optionalStringArray(proxy.apifyProxyGroups, 'proxyConfiguration.apifyProxyGroups', 20);
    const proxyUrls = optionalStringArray(proxy.proxyUrls, 'proxyConfiguration.proxyUrls', 100);
    const apifyProxyCountry = proxy.apifyProxyCountry === undefined
        ? undefined
        : normalizeLocaleCode(proxy.apifyProxyCountry, 'proxyConfiguration.apifyProxyCountry', 'US', true);

    for (const [index, proxyUrl] of (proxyUrls ?? []).entries()) {
        let parsed: URL;
        try {
            parsed = new URL(proxyUrl);
        } catch {
            throw new Error(`proxyConfiguration.proxyUrls[${index}] must be a valid URL.`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error(`proxyConfiguration.proxyUrls[${index}] must use http or https.`);
        }
    }
    if (!useApifyProxy && apifyProxyGroups?.length) {
        throw new Error('proxyConfiguration.apifyProxyGroups requires useApifyProxy=true.');
    }
    if (!useApifyProxy && apifyProxyCountry) {
        throw new Error('proxyConfiguration.apifyProxyCountry requires useApifyProxy=true.');
    }
    if (useApifyProxy && proxyUrls?.length) {
        throw new Error('proxyConfiguration cannot combine Apify Proxy with custom proxy URLs.');
    }

    if (!useApifyProxy && !proxyUrls?.length) return undefined;
    return {
        useApifyProxy,
        ...(apifyProxyGroups?.length ? { apifyProxyGroups } : {}),
        ...(apifyProxyCountry ? { apifyProxyCountry } : {}),
        ...(proxyUrls?.length ? { proxyUrls } : {}),
    };
}

function optionalStringArray(value: unknown, field: string, maximumItems: number): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings.`);
    if (value.length > maximumItems) throw new Error(`${field} supports at most ${maximumItems} items.`);
    return value.map((item, index) => {
        if (typeof item !== 'string' || !item.trim()) throw new Error(`${field}[${index}] must be a non-empty string.`);
        return item.trim();
    });
}

function requireBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`);
    return value;
}

function requireInteger(value: unknown, field: string, minimum: number, maximum: number): number {
    if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return value as number;
}

function asObject(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${field} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: Set<string>, field: string): void {
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`${field} contains unsupported field(s): ${unknown.join(', ')}.`);
}

function deduplicate<T>(items: T[], key: (item: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const value = key(item);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}
