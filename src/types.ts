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
    trackChanges?: boolean;
    monitorName?: string;
    observationHistoryLimit?: number;
    newArticleWindowHours?: number;
    breakingWindowHours?: number;
    proxyConfiguration?: ProxyInput;
}

export interface NormalizedInput {
    queries: string[];
    topics: string[];
    topHeadlines: boolean;
    country: string;
    language: string;
    maxArticlesPerFeed: number;
    trackChanges: boolean;
    monitorName: string;
    observationHistoryLimit: number;
    newArticleWindowHours: number;
    breakingWindowHours: number;
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

export type MonitoringStatus = 'disabled' | 'baseline' | 'new' | 'updated' | 'unchanged' | 'partial';
export type ChangeSeverity = 'info' | 'low' | 'medium' | 'high';
export type FreshnessBucket = 'breaking' | 'fresh' | 'recent' | 'archive' | 'unknown';

export interface MonitoredArticleRecord extends ArticleRecord {
    monitorName: string | null;
    monitoringStatus: MonitoringStatus;
    changeSeverity: ChangeSeverity;
    changeSummary: string;
    changedFields: string[];
    changeSignals: string[];
    previousSeenAt: string | null;
    observationCount: number;
    ageHours: number | null;
    freshnessBucket: FreshnessBucket;
    publisherDomain: string | null;
    storyClusterId: string;
    previousTitle: string | null;
    previousSource: string | null;
    previousPublishedAt: string | null;
}

export interface ArticleObservation {
    observedAt: string;
    title: string;
    source: string;
    sourceUrl: string | null;
    publishedAt: string | null;
    snippet: string | null;
}

export interface MonitorRunMeta {
    completedRuns: number;
    lastCompletedAt: string | null;
    lastRecordsSaved: number;
}

export interface SourceCount {
    source: string;
    articles: number;
    sharePercent: number;
}

export interface NewsMonitorSummary {
    monitorName: string | null;
    trackChanges: boolean;
    total: number;
    baseline: number;
    new: number;
    updated: number;
    unchanged: number;
    partial: number;
    breaking: number;
    fresh: number;
    uniqueSources: number;
    uniqueStoryClusters: number;
    multiArticleClusters: number;
    maxSourceSharePercent: number;
    sourceConcentrationWarning: boolean;
    topSources: SourceCount[];
    signals: Record<string, number>;
    generatedAt: string;
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
    monitoringEnabled?: boolean;
    monitoringStateReadFailures?: number;
    monitoringStateWriteFailures?: number;
    monitoringReportFailures?: number;
    durationMs: number;
    diagnostics: FeedDiagnostic[];
    failureMessage?: string;
}
