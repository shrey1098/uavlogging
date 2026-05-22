import { api } from './client';
import type { Mission, ListParams } from '$lib/types';

export const missionsApi = {
	async list(params?: ListParams): Promise<Mission[]> {
		const { data } = await api.get<any>('/api/missions', { params });
		return (Array.isArray(data.data) ? data.data : data.data?.missions ?? []) as Mission[];
	},
	async get(id: string): Promise<Mission> {
		const { data } = await api.get<any>(`/api/missions/${id}`);
		return (data.data?.mission ?? data.data) as Mission;
	},
	async create(payload: Partial<Mission>): Promise<Mission> {
		const { data } = await api.post<any>('/api/missions', payload);
		return (data.data?.mission ?? data.data) as Mission;
	},
	async update(id: string, payload: Partial<Mission>): Promise<Mission> {
		const { data } = await api.patch<any>(`/api/missions/${id}`, payload);
		return (data.data?.mission ?? data.data) as Mission;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/missions/${id}`);
	}
};