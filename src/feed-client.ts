import { ProxyAgent } from 'undici';
import type { FeedDescriptor, FeedFetchResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ATTEMPTS = 3;
const MAX_RESPONSE_LENGTH = 5_000_000;
const MAX_RETRY_DELAY_MS = 10_000;

export type FeedFetchErrorKind = 'blocked' | 'upstream' | 'invalid_response' | 'timeout' | 'network';

export class FeedFetchError extends Error {
    constructor(
        message: string,
        public readonly kind: FeedFetchErrorKind,
        public readonly statusCode: number | null,
        public readonly attempts: number,
    ) {
        super(message);
        this.name = 'FeedFetchError';
    }
}

export interface FeedClient {
    fetchXml(feed: FeedDescriptor): Promise<FeedFetchResult>;
}

export interface FeedClientOptions {
    country: string;
    language: string;
    proxyUrlProvider?: () => Promise<string | null>;
    fetchImpl?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
    timeoutMs?: number;
    maxAttempts?: number;
}

interface UndiciRequestInit extends RequestInit {
    dispatcher?: ProxyAgent;
}

export function createFeedClient(options: FeedClientOptions): FeedClient {
    const fetchImpl = options.fetchImpl ?? fetch;
    const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const timeoutMs = boundedInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1, 60_000, 'timeoutMs');
    const maxAttempts = boundedInteger(options.maxAttempts ?? DEFAULT_ATTEMPTS, 1, 5, 'maxAttempts');

    return {
        async fetchXml(feed: FeedDescriptor): Promise<FeedFetchResult> {
            let lastError: FeedFetchError | null = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                let dispatcher: ProxyAgent | undefined;
                try {
                    const proxyUrl = await options.proxyUrlProvider?.();
                    if (proxyUrl) dispatcher = new ProxyAgent(proxyUrl);
                    const request: UndiciRequestInit = {
                        headers: {
                            'User-Agent': 'apify-google-news-scraper/1.0',
                            Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
                            'Accept-Encoding': 'gzip, deflate',
                            'Accept-Language': `${options.language}-${options.country},${options.language};q=0.9`,
                        },
                        redirect: 'follow',
                        signal: AbortSignal.timeout(timeoutMs),
                        ...(dispatcher ? { dispatcher } : {}),
                    };
                    const response = await fetchImpl(feed.url, request);
                    const xml = await response.text();

                    if (!response.ok) {
                        const error = classifyStatus(response.status, attempt, feed);
                        if (!isRetryableStatus(response.status) || attempt === maxAttempts) throw error;
                        lastError = error;
                        await sleep(retryDelay(response.headers, attempt));
                        continue;
                    }
                    if (!xml.trim()) {
                        throw new FeedFetchError(
                            `Google News returned an empty response for ${feed.feedType} "${feed.feedQuery}".`,
                            'invalid_response',
                            response.status,
                            attempt,
                        );
                    }
                    if (xml.length > MAX_RESPONSE_LENGTH) {
                        throw new FeedFetchError(
                            `Google News response exceeded the ${MAX_RESPONSE_LENGTH}-character safety limit.`,
                            'invalid_response',
                            response.status,
                            attempt,
                        );
                    }
                    return { xml, attempts: attempt, statusCode: response.status };
                } catch (error) {
                    if (error instanceof FeedFetchError) throw error;
                    const timedOut = error instanceof Error
                        && (error.name === 'AbortError' || error.name === 'TimeoutError');
                    const normalized = new FeedFetchError(
                        `${timedOut ? 'Google News request timed out' : 'Google News network request failed'} for ${feed.feedType} "${feed.feedQuery}": ${safeErrorMessage(error)}`,
                        timedOut ? 'timeout' : 'network',
                        null,
                        attempt,
                    );
                    if (attempt === maxAttempts) throw normalized;
                    lastError = normalized;
                    await sleep(Math.min(500 * (2 ** (attempt - 1)), 4_000));
                } finally {
                    if (dispatcher) {
                        try {
                            await dispatcher.close();
                        } catch {
                            // Preserve the request result when proxy cleanup fails.
                        }
                    }
                }
            }

            throw lastError ?? new FeedFetchError('Google News request failed.', 'network', null, maxAttempts);
        },
    };
}

function classifyStatus(statusCode: number, attempt: number, feed: FeedDescriptor): FeedFetchError {
    if (statusCode === 403 || statusCode === 429) {
        return new FeedFetchError(
            `Google News blocked or throttled ${feed.feedType} "${feed.feedQuery}" with HTTP ${statusCode}.`,
            'blocked',
            statusCode,
            attempt,
        );
    }
    return new FeedFetchError(
        `Google News returned HTTP ${statusCode} for ${feed.feedType} "${feed.feedQuery}".`,
        statusCode >= 500 || statusCode === 408 ? 'upstream' : 'invalid_response',
        statusCode,
        attempt,
    );
}

function isRetryableStatus(statusCode: number): boolean {
    return statusCode === 403 || statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function retryDelay(headers: Headers, attempt: number): number {
    const value = headers.get('retry-after');
    const seconds = value === null ? Number.NaN : Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
    return Math.min(1_000 * (2 ** (attempt - 1)), MAX_RETRY_DELAY_MS);
}

function safeErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
        .replace(/(https?:\/\/)[^/@\s]+(?::[^/@\s]*)?@/gi, '$1[redacted]@');
}

function boundedInteger(value: number, minimum: number, maximum: number, field: string): number {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return value;
}
