import { createHash } from 'node:crypto';
import type {
    ArticleObservation,
    ArticleRecord,
    ChangeSeverity,
    FreshnessBucket,
    MonitorRunMeta,
    MonitoredArticleRecord,
    NormalizedInput,
} from './types.js';

const HEADLINE_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is', 'it', 'of', 'on', 'or',
    'that', 'the', 'this', 'to', 'was', 'were', 'will', 'with', 'says', 'after', 'about', 'new',
]);

export function monitorStoreName(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'watchlist';
    return `google-news-monitor-${slug}-${digest(name).slice(0, 10)}`;
}

export function monitoringKey(record: ArticleRecord): string {
    return `ARTICLE_${digest(record.guid ? `guid:${record.guid}` : `link:${record.link}`)}`;
}

export function normalizeHistory(value: unknown): ArticleObservation[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isObservation).slice(-50);
}

export function normalizeMonitorMeta(value: unknown): MonitorRunMeta {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyMonitorMeta();
    const candidate = value as Record<string, unknown>;
    return {
        completedRuns: nonNegativeInteger(candidate.completedRuns),
        lastCompletedAt: typeof candidate.lastCompletedAt === 'string' ? candidate.lastCompletedAt : null,
        lastRecordsSaved: nonNegativeInteger(candidate.lastRecordsSaved),
    };
}

export function emptyMonitorMeta(): MonitorRunMeta {
    return { completedRuns: 0, lastCompletedAt: null, lastRecordsSaved: 0 };
}

export function latestObservation(history: ArticleObservation[]): ArticleObservation | null {
    return history.at(-1) ?? null;
}

export function enrichArticleRecord(
    record: ArticleRecord,
    input: NormalizedInput,
    previous: ArticleObservation | null,
    previousObservationCount: number,
    hasCompletedBaseline: boolean,
    historyReadable = true,
): MonitoredArticleRecord {
    const ageHours = hoursBetween(record.publishedAt, record.scrapedAt);
    const freshnessBucket = freshness(ageHours, input.breakingWindowHours, input.newArticleWindowHours);
    const common = {
        ...record,
        ageHours: round(ageHours),
        freshnessBucket,
        publisherDomain: publisherDomain(record.sourceUrl),
        storyClusterId: storyClusterId(record),
        previousTitle: previous?.title ?? null,
        previousSource: previous?.source ?? null,
        previousPublishedAt: previous?.publishedAt ?? null,
    };

    if (!input.trackChanges) {
        return {
            ...common,
            monitorName: null,
            monitoringStatus: 'disabled',
            changeSeverity: 'info',
            changeSummary: 'Change tracking disabled.',
            changedFields: [],
            changeSignals: [],
            previousSeenAt: null,
            observationCount: 0,
        };
    }
    if (!historyReadable) {
        return {
            ...common,
            monitorName: input.monitorName,
            monitoringStatus: 'partial',
            changeSeverity: 'low',
            changeSummary: 'Current article saved, but prior monitoring state could not be read.',
            changedFields: [],
            changeSignals: ['history_unavailable'],
            previousSeenAt: null,
            observationCount: previousObservationCount + 1,
        };
    }

    const monitored: MonitoredArticleRecord = {
        ...common,
        monitorName: input.monitorName,
        monitoringStatus: previous ? 'unchanged' : hasCompletedBaseline ? 'new' : 'baseline',
        changeSeverity: 'info',
        changeSummary: previous
            ? 'No monitored article changes detected.'
            : hasCompletedBaseline
                ? 'New article entered the watchlist.'
                : 'Baseline observation saved.',
        changedFields: [],
        changeSignals: [],
        previousSeenAt: previous?.observedAt ?? null,
        observationCount: previousObservationCount + 1,
    };

    if (!previous) {
        if (hasCompletedBaseline) {
            monitored.changeSignals.push('new_article');
            if (freshnessBucket === 'breaking') monitored.changeSignals.push('breaking_article');
            else if (freshnessBucket === 'fresh') monitored.changeSignals.push('fresh_article');
            monitored.changeSeverity = severity(monitored.changeSignals);
            monitored.changeSummary = monitored.changeSignals.includes('breaking_article')
                ? 'New article entered the watchlist inside the configured breaking-news window.'
                : 'New article entered the watchlist since the last complete run.';
        }
        return monitored;
    }

    addChange(monitored, 'title', record.title, previous.title, 'headline_changed');
    addChange(monitored, 'source', record.source, previous.source, 'publisher_changed');
    addChange(monitored, 'sourceUrl', record.sourceUrl, previous.sourceUrl, 'publisher_url_changed');
    addChange(monitored, 'publishedAt', record.publishedAt, previous.publishedAt, 'publication_time_changed');
    addChange(monitored, 'snippet', record.snippet, previous.snippet, 'snippet_changed');
    if (monitored.changedFields.length > 0) {
        monitored.monitoringStatus = 'updated';
        monitored.changeSeverity = severity(monitored.changeSignals);
        monitored.changeSummary = `Changed: ${monitored.changedFields.join(', ')}.`;
    }
    return monitored;
}

export function appendObservation(
    history: ArticleObservation[],
    record: MonitoredArticleRecord,
    limit: number,
): ArticleObservation[] {
    return [...history, {
        observedAt: record.scrapedAt,
        title: record.title,
        source: record.source,
        sourceUrl: record.sourceUrl,
        publishedAt: record.publishedAt,
        snippet: record.snippet,
    }].slice(-limit);
}

function storyClusterId(record: ArticleRecord): string {
    const words = record.title
        .normalize('NFKD')
        .toLocaleLowerCase('en-US')
        .replace(/[\p{M}]/gu, '')
        .match(/[\p{L}\p{N}]+/gu) ?? [];
    const meaningful = [...new Set(words.filter((word) => word.length > 2 && !HEADLINE_STOP_WORDS.has(word)))].sort();
    const day = record.publishedAt?.slice(0, 10) ?? 'undated';
    const fingerprint = meaningful.length > 0 ? meaningful.join(' ') : record.title.toLocaleLowerCase('en-US');
    return `story-${digest(`${day}|${fingerprint}`).slice(0, 16)}`;
}

function publisherDomain(value: string | null): string | null {
    if (!value) return null;
    try {
        return new URL(value).hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
    } catch {
        return null;
    }
}

function freshness(ageHours: number | null, breakingHours: number, freshHours: number): FreshnessBucket {
    if (ageHours === null) return 'unknown';
    if (ageHours <= breakingHours) return 'breaking';
    if (ageHours <= freshHours) return 'fresh';
    if (ageHours <= 168) return 'recent';
    return 'archive';
}

function hoursBetween(start: string | null, end: string): number | null {
    if (!start) return null;
    const delta = Date.parse(end) - Date.parse(start);
    return Number.isFinite(delta) ? Math.max(delta / 3_600_000, 0) : null;
}

function addChange(
    target: MonitoredArticleRecord,
    field: string,
    current: unknown,
    previous: unknown,
    signal: string,
): void {
    if (current === previous) return;
    target.changedFields.push(field);
    target.changeSignals.push(signal);
}

function severity(signals: string[]): ChangeSeverity {
    if (signals.includes('breaking_article') || signals.includes('headline_changed')) return 'high';
    if (signals.some((signal) => ['new_article', 'publisher_changed', 'publication_time_changed'].includes(signal))) return 'medium';
    return signals.length > 0 ? 'low' : 'info';
}

function isObservation(value: unknown): value is ArticleObservation {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.observedAt === 'string'
        && typeof candidate.title === 'string'
        && typeof candidate.source === 'string';
}

function nonNegativeInteger(value: unknown): number {
    return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function round(value: number | null): number | null {
    return value === null ? null : Math.round(value * 100) / 100;
}
