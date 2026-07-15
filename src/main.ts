import { Actor, log } from 'apify';
import { createFeedClient } from './feed-client.js';
import { buildFeeds, normalizeInput } from './input.js';
import { GoogleNewsRunError, scrapeGoogleNews } from './scraper.js';
import type { GoogleNewsRunStatus } from './types.js';

await Actor.main(async () => {
    try {
        const input = normalizeInput((await Actor.getInput<unknown>()) ?? {});
        const feeds = buildFeeds(input);
        log.info(`Fetching ${feeds.length} Google News feed(s) | country=${input.country} language=${input.language}`);

        const proxyConfiguration = input.proxyConfiguration
            ? await Actor.createProxyConfiguration(input.proxyConfiguration)
            : undefined;
        const client = createFeedClient({
            country: input.country,
            language: input.language,
            ...(proxyConfiguration
                ? { proxyUrlProvider: async () => (await proxyConfiguration.newUrl()) ?? null }
                : {}),
        });
        const status = await scrapeGoogleNews(input, {
            client,
            saveRecord: async (record) => await Actor.pushData(record, 'article-scraped'),
            writeStatus: async (runStatus) => { await Actor.setValue('RUN_STATUS', runStatus); },
        });

        const message = statusMessage(status);
        await Actor.setStatusMessage(message);
        if (status.status === 'partial' || status.status === 'stopped_spending_limit') log.warning(message);
        else log.info(message);
    } catch (error) {
        if (error instanceof GoogleNewsRunError) {
            await Actor.setStatusMessage(error.message);
            throw error;
        }

        const message = safeMessage(error);
        const status: GoogleNewsRunStatus = {
            status: 'failed',
            source: 'google_news_rss',
            feedsRequested: 0,
            feedsCompleted: 0,
            feedsEmpty: 0,
            feedsFailed: 0,
            feedsSkipped: 0,
            requestsMade: 0,
            recordsParsed: 0,
            recordsSaved: 0,
            duplicatesSkipped: 0,
            invalidItemsSkipped: 0,
            durationMs: 0,
            diagnostics: [],
            failureMessage: message,
        };
        await Actor.setValue('RUN_STATUS', status);
        await Actor.setStatusMessage(`Failed: ${message}`);
        throw error;
    }
});

function statusMessage(status: GoogleNewsRunStatus): string {
    if (status.status === 'stopped_spending_limit') {
        return `Stopped at the user's spending limit after ${status.recordsSaved} unique article(s).`;
    }
    if (status.status === 'partial') {
        return `Finished partially with ${status.recordsSaved} article(s); ${status.feedsFailed} feed(s) failed. See RUN_STATUS.`;
    }
    if (status.status === 'empty') return 'Finished successfully: the selected feeds contained no usable articles.';
    return `Finished with ${status.recordsSaved} unique article(s).`;
}

function safeMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
        .replace(/(https?:\/\/)[^/@\s]+(?::[^/@\s]*)?@/gi, '$1[redacted]@');
}
