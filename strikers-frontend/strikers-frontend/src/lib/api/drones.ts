import { api, extractList } from './client';
import type { Drone, ListParams } from '$lib/types';

export const dronesApi = {
	async list(params?: ListParams): Promise<Drone[]> {
    const { data } = await api.get<any>('/api/drones', { params });
    const raw = data.data ?? data.message;
    return (Array.isArray(raw) ? raw : raw?.drones ?? []) as Drone[];
},
	async get(id: string): Promise<Drone> {
    if (!id || id === 'skip') return {} as Drone;
    const { data } = await api.get<any>(`/api/drones/${id}`);
    const raw = data.data ?? data.message;
    return (raw?.drone ?? raw) as Drone;
},
	async create(payload: Partial<Drone>): Promise<Drone> {
		const { data } = await api.post<any>('/api/drones', payload);
		return (data.message?.drone ?? data.message) as Drone;
	},
	async update(id: string, payload: Partial<Drone>): Promise<Drone> {
		const { data } = await api.patch<any>(`/api/drones/${id}`, payload);
		return (data.message?.drone ?? data.message) as Drone;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/drones/${id}`);
	}
};