import { api, extractList } from './client';
import type { Drone, ListParams } from '$lib/types';

export const dronesApi = {
	async list(params?: ListParams): Promise<Drone[]> {
		const { data } = await api.get<any>('/api/drones', { params });
		return (Array.isArray(data.data) ? data.data : data.data?.drones ?? []) as Drone[];
	},
	async get(id: string): Promise<Drone> {
		if (!id || id === 'skip') return {} as Drone;
		const { data } = await api.get<any>(`/api/drones/${id}`);
		return (data.data?.drone ?? data.data) as Drone;
	},
	async create(payload: Partial<Drone>): Promise<Drone> {
		const { data } = await api.post<any>('/api/drones', payload);
		return (data.data?.drone ?? data.data) as Drone;
	},
	async update(id: string, payload: Partial<Drone>): Promise<Drone> {
		const { data } = await api.patch<any>(`/api/drones/${id}`, payload);
		return (data.data?.drone ?? data.data) as Drone;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/drones/${id}`);
	}
};