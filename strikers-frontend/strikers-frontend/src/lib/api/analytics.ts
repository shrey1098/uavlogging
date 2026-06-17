import { api } from './client';

export type CategoryTrainingOperator = {
	userId: string;
	operatorId: string;
	name: string;
	sorties: number;
	flightHours: number;
};

export type CategoryTraining = {
	frameType: string;
	operatorCount: number;
	totalFlightHours: number;
	operators: CategoryTrainingOperator[];
};

export const analyticsApi = {
	async droneCategoryTraining(): Promise<CategoryTraining[]> {
		const { data } = await api.get<any>('/api/analytics/drones/category-training');
		return (data.data?.categories ?? []) as CategoryTraining[];
	}
};