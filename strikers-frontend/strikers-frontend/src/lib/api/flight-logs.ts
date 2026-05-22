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
    const raw = data.data ?? data.message;
    return extractList<FlightLog>(raw, 'logs');
},

	async get(id: string): Promise<FlightLog> {
    const { data } = await api.get<any>(`/api/flight-logs/${id}`);
    const raw = data.data ?? data.message;
    return (raw?.log ?? raw?.flightLog ?? raw) as FlightLog;
},

	async upload(
	file: File,
	droneId: string,
	missionId?: string,
	timeClass?: string,
	typeClass?: string,
	onProgress?: (percent: number) => void
): Promise<FlightLogUploadResponse> {
	const form = new FormData();
	form.append('logFile', file);
	form.append('drone', droneId);
	if (missionId) form.append('mission', missionId);
	if (timeClass) form.append('timeClass', timeClass);
	if (typeClass) form.append('typeClass', typeClass);

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
	const flightLog = data.data?.flightLog ?? data.message?.flightLog;
	return { flightLog } as FlightLogUploadResponse;
	},

	async reparse(id: string): Promise<FlightLog> {
		const { data } = await api.post<any>(`/api/flight-logs/${id}/reparse`);
		return (data.message?.log ?? data.message?.flightLog) as FlightLog;
	},

	async remove(id: string): Promise<void> {
		await api.delete(`/api/flight-logs/${id}`);
	}
};