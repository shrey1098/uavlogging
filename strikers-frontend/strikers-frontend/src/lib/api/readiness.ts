import { api } from './client';

export type ReadinessComponents = {
	flightQuality: number;
	currency: number;
	experience: number;
	volume: number;
	liveOps: number;
};

export type ReadinessMeta = {
	flightQualitySampleSize: number;
	lastFlightAt: string | null;
	countedSorties: number;
	countedFlightHours: number;
	realOpsCount: number;
};

export type BadgeCounts = {
	time: { day: number; night: number };
	type: { surveillance: number; drop: number; obstacle: number; navigation: number; fpv: number };
	realOps: number;
	thresholds: {
		category: number[];
		realOps: number[];
	};
	counts: {
		time: { day: number; night: number };
		type: { surveillance: number; drop: number; obstacle: number; navigation: number; fpv: number };
		realOps: number;
	};
};

export type MyReadiness = {
	readiness: {
		score: number;
		components: ReadinessComponents;
		weights: ReadinessComponents;
		meta: ReadinessMeta;
	};
	badges: BadgeCounts;
};

export type OperatorReadiness = {
	user: { _id: string; name: string; role: string };
	readiness: MyReadiness['readiness'];
	badges: BadgeCounts;
};

export type UnitReadinessEntry = {
	user: { _id: string; name: string; email: string };
	readinessScore: number;
	components: ReadinessComponents;
	badges: BadgeCounts;
};

export const readinessApi = {
	async me(): Promise<MyReadiness> {
		const { data } = await api.get<any>('/api/readiness/me');
		return data.data as MyReadiness;
	},
	async forOperator(userId: string): Promise<OperatorReadiness> {
		const { data } = await api.get<any>(`/api/readiness/${userId}`);
		return data.data as OperatorReadiness;
	},
	async unit(): Promise<UnitReadinessEntry[]> {
		const { data } = await api.get<any>('/api/readiness');
		return (data.data?.operators ?? []) as UnitReadinessEntry[];
	}
};

// ── Tier helpers (frontend mapping, not in API) ──────────────────────────────
const TIER_LABELS = ['—', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite', 'Master', 'Legend', 'Apex'];
const TIER_COLORS = [
	'rgb(80 80 80)',       // 0 none
	'rgb(120 120 120)',    // 1 iron
	'rgb(176 120 60)',     // 2 bronze
	'rgb(180 180 180)',    // 3 silver
	'rgb(212 167 44)',     // 4 gold
	'rgb(100 200 255)',    // 5 platinum
	'rgb(140 80 255)',     // 6 diamond
	'rgb(255 100 100)',    // 7 elite
	'rgb(255 60 60)',      // 8 master
	'rgb(255 200 0)',      // 9 legend
	'rgb(255 45 63)'       // 10 apex
];

export function tierLabel(tier: number): string {
	return TIER_LABELS[Math.min(tier, 10)] ?? '—';
}

export function tierColor(tier: number): string {
	return TIER_COLORS[Math.min(tier, 10)] ?? 'rgb(80 80 80)';
}

export function tierEmoji(tier: number): string {
	if (tier === 0) return '—';
	if (tier === 1) return '🔩';
	if (tier === 2) return '🥉';
	if (tier === 3) return '🥈';
	if (tier <= 5) return '🥇';
	return '👑';
}

export function progressToNext(count: number, thresholds: number[]): { pct: number; next: number } {
	for (let i = 0; i < thresholds.length; i++) {
		if (count < thresholds[i]) {
			const prev = i === 0 ? 0 : thresholds[i - 1];
			return {
				pct: Math.round(((count - prev) / (thresholds[i] - prev)) * 100),
				next: thresholds[i]
			};
		}
	}
	return { pct: 100, next: thresholds.at(-1) ?? 0 };
}