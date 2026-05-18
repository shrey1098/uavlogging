import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
import { queryKeys } from './keys';
import {
	authApi,
	dronesApi,
	operatorsApi,
	batteriesApi,
	missionsApi,
	flightLogsApi
} from './index';
import type {
	ListParams,
	CreateDroneRequest,
	CreateOperatorRequest,
	CreateBatteryRequest,
	CreateMissionRequest
} from '$lib/types';

// ---------- Auth ----------
export const useMe = () =>
	createQuery({
		queryKey: queryKeys.me,
		queryFn: () => authApi.me(),
		retry: false,
		staleTime: 5 * 60 * 1000
	});

// ---------- Drones ----------
export const useDrones = (params?: ListParams) =>
	createQuery({
		queryKey: queryKeys.drones.list(params),
		queryFn: () => dronesApi.list(params)
	});

export const useDrone = (id: string) =>
	createQuery({
		queryKey: queryKeys.drones.detail(id),
		queryFn: () => dronesApi.get(id),
		enabled: !!id
	});

export const useCreateDrone = () => {
	const qc = useQueryClient();
	return createMutation({
		mutationFn: (payload: CreateDroneRequest) => dronesApi.create(payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.drones.all })
	});
};

// ---------- Operators ----------
export const useOperators = (params?: ListParams) =>
	createQuery({
		queryKey: queryKeys.operators.list(params),
		queryFn: () => operatorsApi.list(params)
	});

export const useOperator = (id: string) =>
	createQuery({
		queryKey: queryKeys.operators.detail(id),
		queryFn: () => operatorsApi.get(id),
		enabled: !!id
	});

export const useCreateOperator = () => {
	const qc = useQueryClient();
	return createMutation({
		mutationFn: (payload: CreateOperatorRequest) => operatorsApi.create(payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.operators.all })
	});
};

// ---------- Batteries ----------
export const useBatteries = (params?: ListParams) =>
	createQuery({
		queryKey: queryKeys.batteries.list(params),
		queryFn: () => batteriesApi.list(params)
	});

export const useCreateBattery = () => {
	const qc = useQueryClient();
	return createMutation({
		mutationFn: (payload: CreateBatteryRequest) => batteriesApi.create(payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batteries.all })
	});
};

// ---------- Missions ----------
export const useMissions = (params?: ListParams) =>
	createQuery({
		queryKey: queryKeys.missions.list(params),
		queryFn: () => missionsApi.list(params)
	});

export const useMission = (id: string) =>
	createQuery({
		queryKey: queryKeys.missions.detail(id),
		queryFn: () => missionsApi.get(id),
		enabled: !!id
	});

export const useCreateMission = () => {
	const qc = useQueryClient();
	return createMutation({
		mutationFn: (payload: CreateMissionRequest) => missionsApi.create(payload),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.missions.all })
	});
};

// ---------- Flight Logs ----------
export const useFlightLogs = (params?: ListParams) =>
	createQuery({
		queryKey: queryKeys.flightLogs.list(params),
		queryFn: () => flightLogsApi.list(params)
	});

export const useFlightLog = (id: string) =>
	createQuery({
		queryKey: queryKeys.flightLogs.detail(id),
		queryFn: () => flightLogsApi.get(id),
		enabled: !!id,
		// Poll while parsing
		refetchInterval: (q) => {
			const log = q.state.data;
			return log?.parseStatus === 'parsing' || log?.parseStatus === 'queued' ? 3000 : false;
		}
	});

export function useUploadFlightLog() {
	return createMutation({
		mutationFn: ({ file, droneId, missionId, onProgress }: {
			file: File;
			droneId: string;
			missionId?: string;
			onProgress?: (p: number) => void;
		}) => flightLogsApi.upload(file, droneId, missionId, onProgress),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.flightLogs.all });
		}
	});
}

export const useReparseFlightLog = () => {
	const qc = useQueryClient();
	return createMutation({
		mutationFn: (id: string) => flightLogsApi.reparse(id),
		onSuccess: (_, id) => {
			qc.invalidateQueries({ queryKey: queryKeys.flightLogs.detail(id) });
		}
	});
};
