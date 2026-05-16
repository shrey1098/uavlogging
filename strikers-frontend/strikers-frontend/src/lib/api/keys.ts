export const queryKeys = {
	me: ['me'] as const,
	drones: {
		all: ['drones'] as const,
		list: (params?: unknown) => ['drones', 'list', params] as const,
		detail: (id: string) => ['drones', 'detail', id] as const
	},
	operators: {
		all: ['operators'] as const,
		list: (params?: unknown) => ['operators', 'list', params] as const,
		detail: (id: string) => ['operators', 'detail', id] as const
	},
	batteries: {
		all: ['batteries'] as const,
		list: (params?: unknown) => ['batteries', 'list', params] as const,
		detail: (id: string) => ['batteries', 'detail', id] as const
	},
	missions: {
		all: ['missions'] as const,
		list: (params?: unknown) => ['missions', 'list', params] as const,
		detail: (id: string) => ['missions', 'detail', id] as const
	},
	flightLogs: {
		all: ['flight-logs'] as const,
		list: (params?: unknown) => ['flight-logs', 'list', params] as const,
		detail: (id: string) => ['flight-logs', 'detail', id] as const
	}
};
