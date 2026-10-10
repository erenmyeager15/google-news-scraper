import type { MonitoredArticleRecord, NewsMonitorSummary, SourceCount } from './types.js';

export function buildMonitorSummary(
    rows: MonitoredArticleRecord[],
    monitorName: string | null,
    trackChanges: boolean,
): NewsMonitorSummary {
    const sourceCounts = countBy(rows.map((row) => row.source));
    const clusterCounts = countBy(rows.map((row) => row.storyClusterId));
    const topSources: SourceCount[] = [...sourceCounts.entries()]
        .map(([source, articles]) => ({ source, articles, sharePercent: percent(articles, rows.length) }))
        .sort((left, right) => right.articles - left.articles || left.source.localeCompare(right.source))
        .slice(0, 10);
    const signals: Record<string, number> = {};
    for (const row of rows) {
        for (const signal of row.changeSignals) signals[signal] = (signals[signal] ?? 0) + 1;
    }
    const maxSourceSharePercent = topSources[0]?.sharePercent ?? 0;
    return {
        monitorName,
        trackChanges,
        total: rows.length,
        baseline: countStatus(rows, 'baseline'),
        new: countStatus(rows, 'new'),
        updated: countStatus(rows, 'updated'),
        unchanged: countStatus(rows, 'unchanged'),
        partial: countStatus(rows, 'partial'),
        breaking: rows.filter((row) => row.freshnessBucket === 'breaking').length,
        fresh: rows.filter((row) => row.freshnessBucket === 'breaking' || row.freshnessBucket === 'fresh').length,
        uniqueSources: sourceCounts.size,
        uniqueStoryClusters: clusterCounts.size,
        multiArticleClusters: [...clusterCounts.values()].filter((count) => count > 1).length,
        maxSourceSharePercent,
        sourceConcentrationWarning: rows.length >= 5 && maxSourceSharePercent > 50,
        topSources,
        signals,
        generatedAt: new Date().toISOString(),
    };
}

export function monitorMarkdown(summary: NewsMonitorSummary, rows: MonitoredArticleRecord[]): string {
    const alerts = rows.filter((row) => ['new', 'updated', 'partial'].includes(row.monitoringStatus));
    const lines = [
        '# Google News monitoring report',
        '',
        `- Monitor: ${summary.monitorName ?? 'disabled'}`,
        `- Articles: ${summary.total}`,
        `- New: ${summary.new}; updated: ${summary.updated}; unchanged: ${summary.unchanged}; baseline: ${summary.baseline}; partial: ${summary.partial}`,
        `- Fresh / breaking-window articles: ${summary.fresh} / ${summary.breaking}`,
        `- Sources: ${summary.uniqueSources}; story clusters: ${summary.uniqueStoryClusters}; multi-article clusters: ${summary.multiArticleClusters}`,
        `- Largest source share: ${summary.maxSourceSharePercent}%${summary.sourceConcentrationWarning ? ' (concentrated)' : ''}`,
        '',
        '## Top sources',
        '',
        ...(summary.topSources.length > 0
            ? summary.topSources.map((source) => `- ${escapeMarkdown(source.source)}: ${source.articles} article(s), ${source.sharePercent}%`)
            : ['No article sources were saved.']),
        '',
        '## Alerts and changes',
        '',
    ];
    if (alerts.length === 0) lines.push('No new or changed monitored articles detected.');
    for (const row of alerts) {
        lines.push(`- [${escapeMarkdown(row.title)}](${row.link}) — ${row.changeSummary}`);
    }
    return `${lines.join('\n')}\n`;
}

export function monitorCsv(rows: MonitoredArticleRecord[]): string {
    const fields = [
        'title', 'source', 'publisherDomain', 'monitoringStatus', 'changeSeverity', 'changeSummary', 'changeSignals',
        'publishedAt', 'ageHours', 'freshnessBucket', 'storyClusterId', 'feedType', 'feedQuery', 'country', 'language',
        'previousSeenAt', 'observationCount', 'link', 'scrapedAt',
    ];
    const records = rows.map((row) => [
        row.title, row.source, row.publisherDomain, row.monitoringStatus, row.changeSeverity, row.changeSummary,
        row.changeSignals.join('|'), row.publishedAt, row.ageHours, row.freshnessBucket, row.storyClusterId,
        row.feedType, row.feedQuery, row.country, row.language, row.previousSeenAt, row.observationCount, row.link,
        row.scrapedAt,
    ]);
    return [fields, ...records].map((record) => record.map(csvCell).join(',')).join('\n') + '\n';
}

function countStatus(rows: MonitoredArticleRecord[], status: MonitoredArticleRecord['monitoringStatus']): number {
    return rows.filter((row) => row.monitoringStatus === status).length;
}

function countBy(values: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}

function percent(value: number, total: number): number {
    return total === 0 ? 0 : Math.round((value / total) * 10_000) / 100;
}

function csvCell(value: unknown): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function escapeMarkdown(value: string): string {
    return value.replace(/[\\[\]]/g, '\\$&');
}
