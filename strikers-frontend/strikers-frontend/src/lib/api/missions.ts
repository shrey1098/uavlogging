import { api, extractList, extractOne } from './client';
import type { ApiResponse, Mission, CreateMissionRequest, ListParams } from '$lib/types';

export const missionsApi = {
	async list(params?: ListParams): Promise<Mission[]> {
		const { data } = await api.get<ApiResponse<unknown>>('/api/missions', { params });
		return extractList<Mission>(data.data, 'missions');
	},
	async get(id: string): Promise<Mission> {
		const { data } = await api.get<ApiResponse<unknown>>(`/api/missions/${id}`);
		return extractOne<Mission>(data.data, 'mission') as Mission;
	},
	async create(payload: CreateMissionRequest): Promise<Mission> {
		const { data } = await api.post<ApiResponse<unknown>>('/api/missions', payload);
		return extractOne<Mission>(data.data, 'mission') as Mission;
	},
	async update(id: string, payload: Partial<CreateMissionRequest>): Promise<Mission> {
		const { data } = await api.patch<ApiResponse<unknown>>(`/api/missions/${id}`, payload);
		return extractOne<Mission>(data.data, 'mission') as Mission;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/missions/${id}`);
	}
};
