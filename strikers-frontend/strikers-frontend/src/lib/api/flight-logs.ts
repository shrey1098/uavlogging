import { api, extractList, extractOne } from './client';
import type {
	ApiResponse,
	FlightLog,
	FlightLogUploadResponse,
	ListParams
} from '$lib/types';

export const flightLogsApi = {
	async list(params?: ListParams): Promise<FlightLog[]> {
		const { data } = await api.get<ApiResponse<unknown>>('/api/flight-logs', { params });
		return extractList<FlightLog>(data.data, 'flightLogs');
	},

	async get(id: string): Promise<FlightLog> {
		const { data } = await api.get<ApiResponse<unknown>>(`/api/flight-logs/${id}`);
		return extractOne<FlightLog>(data.data, 'flightLog') as FlightLog;
	},

	async upload(
		file: File,
		onProgress?: (percent: number) => void
	): Promise<FlightLogUploadResponse> {
		const form = new FormData();
		form.append('logFile', file);

		const { data } = await api.post<ApiResponse<unknown>>(
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
		return extractOne<FlightLogUploadResponse>(data.data, 'flightLog') as FlightLogUploadResponse;
	},

	async reparse(id: string): Promise<FlightLog> {
		const { data } = await api.post<ApiResponse<unknown>>(`/api/flight-logs/${id}/reparse`);
		return extractOne<FlightLog>(data.data, 'flightLog') as FlightLog;
	},

	async remove(id: string): Promise<void> {
		await api.delete(`/api/flight-logs/${id}`);
	}
};
