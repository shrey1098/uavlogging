import { api, extractList } from './client';
import type { ApiResponse, Battery, CreateBatteryRequest, ListParams } from '$lib/types';

export const batteriesApi = {
	async list(params?: ListParams): Promise<Battery[]> {
		const { data } = await api.get<ApiResponse<unknown>>('/api/batteries', { params });
		return extractList<Battery>(data.data, 'batteries');
	},
	async get(id: string): Promise<Battery> {
		const { data } = await api.get<ApiResponse<Battery>>(`/api/batteries/${id}`);
		return data.data as Battery;
	},
	async create(payload: CreateBatteryRequest): Promise<Battery> {
		const { data } = await api.post<ApiResponse<Battery>>('/api/batteries', payload);
		return data.data as Battery;
	},
	async update(id: string, payload: Partial<CreateBatteryRequest>): Promise<Battery> {
		const { data } = await api.patch<ApiResponse<Battery>>(`/api/batteries/${id}`, payload);
		return data.data as Battery;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/batteries/${id}`);
	}
};
