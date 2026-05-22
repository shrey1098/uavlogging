import { api } from './client';
import type { Operator, CreateOperatorRequest, ListParams } from '$lib/types';

export const operatorsApi = {
	async list(params?: ListParams): Promise<Operator[]> {
		const { data } = await api.get<any>('/api/operators', { params });
		return (Array.isArray(data.data) ? data.data : data.data?.operators ?? []) as Operator[];
	},
	async get(id: string): Promise<Operator> {
		if (!id || id === 'skip') return {} as Operator;
		const { data } = await api.get<any>(`/api/operators/${id}`);
		return (data.data?.operator ?? data.data) as Operator;
	},
	async create(payload: CreateOperatorRequest): Promise<Operator> {
		const { data } = await api.post<any>('/api/operators', payload);
		return (data.data?.operator ?? data.data) as Operator;
	},
	async update(id: string, payload: Partial<CreateOperatorRequest>): Promise<Operator> {
		const { data } = await api.patch<any>(`/api/operators/${id}`, payload);
		return (data.data?.operator ?? data.data) as Operator;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/operators/${id}`);
	}
};