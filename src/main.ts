import { Actor, log } from 'apify';
import { createFeedClient } from './feed-client.js';
import { buildFeeds, normalizeInput } from './input.js';
import {
    appendObservation,
    emptyMonitorMeta,
    enrichArticleRecord,
    latestObservation,
    monitoringKey,
    monitorStoreName,
    normalizeHistory,
    normalizeMonitorMeta,
} from './monitoring.js';
import { buildMonitorSummary, monitorCsv, monitorMarkdown } from './reports.js';
import { scrapeGoogleNews } from './scraper.js';
import type {
    ArticleObservation,
    GoogleNewsRunStatus,
    MonitorRunMeta,
    MonitoredArticleRecord,
    NormalizedInput,
} from './types.js';

await Actor.main(async () => {
    const startedAt = Date.now();
    let input: NormalizedInput;
    try {
        input = normalizeInput((await Actor.getInput<unknown>()) ?? {});
    } catch (error) {
        await Actor.setValue('RUN_STATUS', failedStatus(startedAt, error));
        throw error;
    }

    try {
        const feeds = buildFeeds(input);
        log.info(`Fetching ${feeds.length} Google News feed(s).`, {
            country: input.country,
            language: input.language,
            monitoringEnabled: input.trackChanges,
            monitorName: input.trackChanges ? input.monitorName : null,
        });

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

        const monitorStore = input.trackChanges ? await Actor.openKeyValueStore(monitorStoreName(input.monitorName)) : null;
        let monitorMeta: MonitorRunMeta = emptyMonitorMeta();
        let runStateReadable = true;
        let monitoringStateReadFailures = 0;
        let monitoringStateWriteFailures = 0;
        let monitoringReportFailures = 0;
        if (monitorStore) {
            try {
                monitorMeta = normalizeMonitorMeta(await monitorStore.getValue('MONITOR_META'));
            } catch (error) {
                runStateReadable = false;
                monitoringStateReadFailures += 1;
                log.warning('Could not read watchlist metadata; current rows will report partial monitoring state.', {
                    error: sanitizedErrorMessage(error),
                });
            }
        }

        const rows: MonitoredArticleRecord[] = [];
        const pendingHistory = new Map<string, ArticleObservation[]>();
        const status = await scrapeGoogleNews(input, {
            client,
            saveRecord: async (record) => {
                const key = monitoringKey(record);
                let history: ArticleObservation[] = [];
                let historyReadable = runStateReadable;
                if (monitorStore && runStateReadable) {
                    try {
                        history = normalizeHistory(await monitorStore.getValue(key));
                    } catch (error) {
                        historyReadable = false;
                        monitoringStateReadFailures += 1;
                        log.warning('Could not read prior article history; saving the current row as partial.', {
                            key,
                            error: sanitizedErrorMessage(error),
                        });
                    }
                }

                const monitored = enrichArticleRecord(
                    record,
                    input,
                    latestObservation(history),
                    history.length,
                    monitorMeta.completedRuns > 0,
                    historyReadable,
                );
                const charge = await Actor.pushData(monitored, 'article-scraped');
                const recordWasSaved = charge.chargedCount > 0 || !charge.eventChargeLimitReached;
                if (recordWasSaved) {
                    rows.push(monitored);
                    if (monitorStore && historyReadable) {
                        pendingHistory.set(key, appendObservation(history, monitored, input.observationHistoryLimit));
                    }
                }
                return charge;
            },
            writeStatus: async (runStatus) => { await Actor.setValue('RUN_STATUS', runStatus); },
        });

        if (monitorStore) {
            const entries = [...pendingHistory.entries()];
            for (let index = 0; index < entries.length; index += 25) {
                await Promise.all(entries.slice(index, index + 25).map(async ([key, history]) => {
                    try {
                        await monitorStore.setValue(key, history);
                    } catch (error) {
                        monitoringStateWriteFailures += 1;
                        log.warning('Could not save article history; the paid dataset row remains available.', {
                            key,
                            error: sanitizedErrorMessage(error),
                        });
                    }
                }));
            }
            if (status.status === 'succeeded' && rows.length > 0 && runStateReadable && monitoringStateWriteFailures === 0) {
                try {
                    await monitorStore.setValue('MONITOR_META', {
                        completedRuns: monitorMeta.completedRuns + 1,
                        lastCompletedAt: new Date().toISOString(),
                        lastRecordsSaved: rows.length,
                    } satisfies MonitorRunMeta);
                } catch (error) {
                    monitoringStateWriteFailures += 1;
                    log.warning('Could not advance watchlist metadata; article rows and histories remain available.', {
                        error: sanitizedErrorMessage(error),
                    });
                }
            }
        }

        const summary = buildMonitorSummary(rows, input.trackChanges ? input.monitorName : null, input.trackChanges);
        for (const [key, value, options] of [
            ['MONITOR_SUMMARY', summary, undefined],
            ['MONITOR_REPORT.md', monitorMarkdown(summary, rows), { contentType: 'text/markdown; charset=utf-8' }],
            ['MONITOR_REPORT.csv', monitorCsv(rows), { contentType: 'text/csv; charset=utf-8' }],
        ] as const) {
            try {
                await Actor.setValue(key, value, options);
            } catch (error) {
                monitoringReportFailures += 1;
                log.warning('Could not save a monitoring report; dataset rows remain available.', {
                    key,
                    error: sanitizedErrorMessage(error),
                });
            }
        }

        const hasMonitoringFailure = monitoringStateReadFailures + monitoringStateWriteFailures + monitoringReportFailures > 0;
        const finalStatus: GoogleNewsRunStatus = {
            ...status,
            status: status.status === 'succeeded' && hasMonitoringFailure ? 'partial' : status.status,
            monitoringEnabled: input.trackChanges,
            monitoringStateReadFailures,
            monitoringStateWriteFailures,
            monitoringReportFailures,
        };
        await Actor.setValue('RUN_STATUS', finalStatus);
        const message = statusMessage(finalStatus, summary.new, summary.updated);
        await Actor.setStatusMessage(message);
        if (finalStatus.status === 'partial' || finalStatus.status === 'stopped_spending_limit') log.warning(message);
        else log.info(message);
    } catch (error) {
        const current = await Actor.getValue<GoogleNewsRunStatus>('RUN_STATUS');
        await Actor.setValue('RUN_STATUS', failedStatus(startedAt, error, current));
        await Actor.setStatusMessage(`Failed: ${sanitizedErrorMessage(error)}`);
        throw error;
    }
});

function statusMessage(status: GoogleNewsRunStatus, newArticles: number, updatedArticles: number): string {
    if (status.status === 'stopped_spending_limit') {
        return `Stopped at the user's spending limit after ${status.recordsSaved} unique article(s).`;
    }
    if (status.status === 'partial') {
        return `Saved ${status.recordsSaved} article(s) with partial source or monitoring evidence. See RUN_STATUS.`;
    }
    if (status.status === 'empty') return 'Finished successfully: the selected feeds contained no usable articles.';
    return `Finished with ${status.recordsSaved} article(s), ${newArticles} new and ${updatedArticles} updated.`;
}

function failedStatus(
    startedAt: number,
    error: unknown,
    current?: GoogleNewsRunStatus | null,
): GoogleNewsRunStatus {
    const base: GoogleNewsRunStatus = {
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
        monitoringEnabled: false,
        monitoringStateReadFailures: 0,
        monitoringStateWriteFailures: 0,
        monitoringReportFailures: 0,
        durationMs: 0,
        diagnostics: [],
    };
    return {
        ...base,
        ...(current ?? {}),
        status: 'failed',
        durationMs: Math.max(0, Date.now() - startedAt),
        failureMessage: sanitizedErrorMessage(error),
    };
}

function sanitizedErrorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error))
        .replace(/(https?:\/\/)[^/@\s]+(?::[^/@\s]*)?@/gi, '$1[redacted]@')
        .replace(/([?&](?:key|access_token)=)[^&\s]+/gi, '$1[redacted]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}
