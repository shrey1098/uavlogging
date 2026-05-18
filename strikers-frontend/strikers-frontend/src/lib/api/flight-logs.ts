import { api, extractList } from './client';
import type {
	ApiResponse,
	FlightLog,
	FlightLogUploadResponse,
	ListParams
} from '$lib/types';

export const flightLogsApi = {
	async list(params?: ListParams): Promise<FlightLog[]> {
		const { data } = await api.get<any>('/api/flight-logs', { params });
		const raw = data.message ?? data.data;
		return extractList<FlightLog>(raw, 'flightLogs');
	},

	async get(id: string): Promise<FlightLog> {
		const { data } = await api.get<any>(`/api/flight-logs/${id}`);
		return (data.message?.log ?? data.message?.flightLog) as FlightLog;
	},

	async upload(
	file: File,
	droneId: string,
	missionId?: string,
	onProgress?: (percent: number) => void
): Promise<FlightLogUploadResponse> {
	const form = new FormData();
	form.append('logFile', file);
	form.append('drone', droneId);
	if (missionId) form.append('mission', missionId);

	const { data } = await api.post<any>(
		'/api/flight-logs/upload',
		form,
		{
			headers: { 'Content-Type': 'multipart/form-data' },
			onUploadProgress: (e) => {
				if (e.total && onProgress) {
					onProgress(Math.round((e.loaded * 100) / e.total));
				}
			}
		}
	);
	const raw = data.message;
	return { flightLog: raw.flightLog, mission: raw.mission ?? null } as FlightLogUploadResponse;
},

	async reparse(id: string): Promise<FlightLog> {
		const { data } = await api.post<any>(`/api/flight-logs/${id}/reparse`);
		return (data.message?.log ?? data.message?.flightLog) as FlightLog;
	},

	async remove(id: string): Promise<void> {
		await api.delete(`/api/flight-logs/${id}`);
	}
};