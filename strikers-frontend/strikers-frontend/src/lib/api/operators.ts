import { api, extractList, extractOne } from './client';
import type { ApiResponse, Operator, CreateOperatorRequest, ListParams } from '$lib/types';

export const operatorsApi = {
	async list(params?: ListParams): Promise<Operator[]> {
		const { data } = await api.get<ApiResponse<unknown>>('/api/operators', { params });
		return extractList<Operator>(data.data, 'operators');
	},
	async get(id: string): Promise<Operator> {
		const { data } = await api.get<ApiResponse<unknown>>(`/api/operators/${id}`);
		return extractOne<Operator>(data.data, 'operator') as Operator;
	},
	async create(payload: CreateOperatorRequest): Promise<Operator> {
		const { data } = await api.post<ApiResponse<unknown>>('/api/operators', payload);
		return extractOne<Operator>(data.data, 'operator') as Operator;
	},
	async update(id: string, payload: Partial<CreateOperatorRequest>): Promise<Operator> {
		const { data } = await api.patch<ApiResponse<unknown>>(`/api/operators/${id}`, payload);
		return extractOne<Operator>(data.data, 'operator') as Operator;
	},
	async remove(id: string): Promise<void> {
		await api.delete(`/api/operators/${id}`);
	}
};
