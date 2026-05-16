import { api, extractList, extractOne } from './client';
import type { ApiResponse, Drone, CreateDroneRequest, ListParams } from '$lib/types';

export const dronesApi = {
	async list(params?: ListParams): Promise<Drone[]> {
		const { data } = await api.get<ApiResponse<unknown>>('/api/drones', { params });
		return extractList<Drone>(data.data, 'drones');
	},
	async get(id: string): Promise<Drone> {
		const { data } = await api.get<ApiResponse<unknown>>(`/api/drones/${id}`);
		return extractOne<Drone>(data.data, 'drone') as Drone;
	},
	async create(payload: CreateDroneRequest): Promise<Drone> {
		const { data } = await api.post<ApiResponse<unknown>>('/api/drones', payload);
		return extractOne<Drone>(data.data, 'drone') as Drone;
	},
	async update(id: string, payload: Partial<CreateDroneRequest>): Promise<Drone> {
		const { data } = await api.patch<ApiResponse<unknown>>(`/api/drones/${id}`, payload);
		return extractOne<Drone>(data.data, 'drone') as Drone;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/drones/${id}`);
	}
};
