export type FeedType = 'search' | 'topic' | 'top';

export interface ProxyInput {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    apifyProxyCountry?: string;
    proxyUrls?: string[];
}

export interface ActorInput {
    queries?: string[];
    topics?: string[];
    topHeadlines?: boolean;
    country?: string;
    language?: string;
    maxArticlesPerFeed?: number;
    proxyConfiguration?: ProxyInput;
}

export interface NormalizedInput {
    queries: string[];
    topics: string[];
    topHeadlines: boolean;
    country: string;
    language: string;
    maxArticlesPerFeed: number;
    proxyConfiguration?: ProxyInput;
}

export interface FeedDescriptor {
    url: string;
    feedType: FeedType;
    feedQuery: string;
}

export interface ArticleRecord {
    title: string;
    source: string;
    sourceUrl: string | null;
    link: string;
    guid: string | null;
    publishedAt: string | null;
    snippet: string | null;
    feedType: FeedType;
    feedQuery: string;
    country: string;
    language: string;
    scrapedAt: string;
}

export interface FeedParseResult {
    records: ArticleRecord[];
    itemsSeen: number;
    invalidItemsSkipped: number;
}

export interface FeedFetchResult {
    xml: string;
    attempts: number;
    statusCode: number;
}

export interface ChargeResult {
    chargedCount: number;
    eventChargeLimitReached: boolean;
}

export interface FeedDiagnostic {
    feedType: FeedType;
    feedQuery: string;
    status: 'succeeded' | 'empty' | 'failed';
    attempts: number;
    itemsSeen: number;
    recordsParsed: number;
    recordsSaved: number;
    duplicatesSkipped: number;
    invalidItemsSkipped: number;
    errorMessage?: string;
}

export interface GoogleNewsRunStatus {
    status: 'succeeded' | 'partial' | 'empty' | 'stopped_spending_limit' | 'failed';
    source: 'google_news_rss';
    feedsRequested: number;
    feedsCompleted: number;
    feedsEmpty: number;
    feedsFailed: number;
    feedsSkipped: number;
    requestsMade: number;
    recordsParsed: number;
    recordsSaved: number;
    duplicatesSkipped: number;
    invalidItemsSkipped: number;
    durationMs: number;
    diagnostics: FeedDiagnostic[];
    failureMessage?: string;
}
