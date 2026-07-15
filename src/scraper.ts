import { FeedFetchError, type FeedClient } from './feed-client.js';
import { buildFeeds } from './input.js';
import { FeedParseError, isValidArticleRecord, parseFeed } from './routes.js';
import type {
    ArticleRecord,
    ChargeResult,
    FeedDiagnostic,
    GoogleNewsRunStatus,
    NormalizedInput,
} from './types.js';

export interface ScraperDependencies {
    client: FeedClient;
    saveRecord: (record: ArticleRecord) => Promise<ChargeResult>;
    writeStatus: (status: GoogleNewsRunStatus) => Promise<void>;
    now?: () => Date;
    nowMs?: () => number;
}

export class GoogleNewsRunError extends Error {
    constructor(message: string, public readonly runStatus: GoogleNewsRunStatus) {
        super(message);
        this.name = 'GoogleNewsRunError';
    }
}

export async function scrapeGoogleNews(
    input: NormalizedInput,
    dependencies: ScraperDependencies,
): Promise<GoogleNewsRunStatus> {
    const now = dependencies.now ?? (() => new Date());
    const nowMs = dependencies.nowMs ?? (() => Date.now());
    const startedAt = nowMs();
    const feeds = buildFeeds(input);
    const diagnostics: FeedDiagnostic[] = [];
    const seen = new Set<string>();
    let recordsParsed = 0;
    let recordsSaved = 0;
    let duplicatesSkipped = 0;
    let invalidItemsSkipped = 0;
    let requestsMade = 0;
    let spendingLimitReached = false;

    for (const feed of feeds) {
        if (spendingLimitReached) break;
        let fetched;
        let parsed;
        try {
            fetched = await dependencies.client.fetchXml(feed);
            requestsMade += fetched.attempts;
            parsed = parseFeed(
                fetched.xml,
                feed,
                { country: input.country, language: input.language },
                input.maxArticlesPerFeed,
                now,
            );
        } catch (error) {
            const attempts = error instanceof FeedFetchError ? error.attempts : fetched?.attempts ?? 0;
            requestsMade += error instanceof FeedFetchError ? error.attempts : 0;
            diagnostics.push({
                feedType: feed.feedType,
                feedQuery: feed.feedQuery,
                status: 'failed',
                attempts,
                itemsSeen: 0,
                recordsParsed: 0,
                recordsSaved: 0,
                duplicatesSkipped: 0,
                invalidItemsSkipped: 0,
                errorMessage: safeMessage(error),
            });
            continue;
        }

        recordsParsed += parsed.records.length;
        invalidItemsSkipped += parsed.invalidItemsSkipped;
        const diagnostic: FeedDiagnostic = {
            feedType: feed.feedType,
            feedQuery: feed.feedQuery,
            status: parsed.records.length === 0 ? 'empty' : 'succeeded',
            attempts: fetched.attempts,
            itemsSeen: parsed.itemsSeen,
            recordsParsed: parsed.records.length,
            recordsSaved: 0,
            duplicatesSkipped: 0,
            invalidItemsSkipped: parsed.invalidItemsSkipped,
        };

        for (const record of parsed.records) {
            if (!isValidArticleRecord(record)) {
                diagnostic.invalidItemsSkipped += 1;
                invalidItemsSkipped += 1;
                continue;
            }
            const keys = articleKeys(record);
            if (keys.some((key) => seen.has(key))) {
                diagnostic.duplicatesSkipped += 1;
                duplicatesSkipped += 1;
                continue;
            }

            const charge = await dependencies.saveRecord(record);
            const recordWasSaved = charge.chargedCount > 0 || !charge.eventChargeLimitReached;
            if (recordWasSaved) {
                for (const key of keys) seen.add(key);
                diagnostic.recordsSaved += 1;
                recordsSaved += 1;
            }
            if (charge.eventChargeLimitReached) {
                spendingLimitReached = true;
                break;
            }
        }
        diagnostics.push(diagnostic);
    }

    const feedsFailed = diagnostics.filter((diagnostic) => diagnostic.status === 'failed').length;
    const feedsEmpty = diagnostics.filter((diagnostic) => diagnostic.status === 'empty').length;
    const feedsCompleted = diagnostics.length - feedsFailed;
    const status: GoogleNewsRunStatus = {
        status: determineStatus(spendingLimitReached, recordsSaved, feedsFailed),
        source: 'google_news_rss',
        feedsRequested: feeds.length,
        feedsCompleted,
        feedsEmpty,
        feedsFailed,
        feedsSkipped: feeds.length - diagnostics.length,
        requestsMade,
        recordsParsed,
        recordsSaved,
        duplicatesSkipped,
        invalidItemsSkipped,
        durationMs: Math.max(0, nowMs() - startedAt),
        diagnostics,
    };

    if (status.status === 'failed') {
        status.failureMessage = `No articles were saved because ${feedsFailed} of ${feeds.length} Google News feed(s) failed.`;
    }
    await dependencies.writeStatus(status);
    if (status.status === 'failed') throw new GoogleNewsRunError(status.failureMessage ?? 'Google News run failed.', status);
    return status;
}

function determineStatus(
    spendingLimitReached: boolean,
    recordsSaved: number,
    feedsFailed: number,
): GoogleNewsRunStatus['status'] {
    if (spendingLimitReached) return 'stopped_spending_limit';
    if (recordsSaved > 0 && feedsFailed > 0) return 'partial';
    if (recordsSaved > 0) return 'succeeded';
    if (feedsFailed > 0) return 'failed';
    return 'empty';
}

function articleKeys(record: ArticleRecord): string[] {
    return [record.guid ? `guid:${record.guid}` : null, `link:${record.link}`]
        .filter((value): value is string => value !== null);
}

function safeMessage(error: unknown): string {
    const prefix = error instanceof FeedParseError || error instanceof FeedFetchError
        ? error.message
        : error instanceof Error
            ? error.message
            : String(error);
    return prefix.replace(/\s+/g, ' ').trim().slice(0, 500);
}
