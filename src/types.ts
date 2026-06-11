export interface ActorInput {
    queries?: string[];
    topics?: string[];
    topHeadlines?: boolean;
    country?: string;
    language?: string;
    maxArticlesPerFeed?: number;
    proxyConfiguration?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
        proxyUrls?: string[];
    };
}

export interface ArticleRecord {
    title: string | null;
    source: string | null;
    link: string | null;
    guid: string | null;
    publishedAt: string | null;
    snippet: string | null;
    feedType: string;
    feedQuery: string;
    country: string;
    language: string;
    scrapedAt: string;
}
