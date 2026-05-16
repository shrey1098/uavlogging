export function formatDuration(seconds: number | undefined): string {
	if (!seconds || seconds < 0) return '—';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatHours(seconds: number | undefined): string {
	if (!seconds) return '0h';
	return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatDate(iso: string | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return (
		d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
		' · ' +
		d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
	);
}

export function relativeTime(iso: string | undefined): string {
	if (!iso) return '—';
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return formatDate(iso);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
