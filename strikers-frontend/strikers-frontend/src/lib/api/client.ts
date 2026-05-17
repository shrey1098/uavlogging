import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const BASE_URL = env.PUBLIC_API_BASE_URL || 'http://localhost:5000';

// In-memory token storage (more secure than localStorage for access tokens)
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
	accessToken = token;
	if (browser && token) {
		// Persist across reloads via sessionStorage (cleared on tab close)
		sessionStorage.setItem('strikers.accessToken', token);
	} else if (browser) {
		sessionStorage.removeItem('strikers.accessToken');
	}
}

export function getAccessToken(): string | null {
	if (accessToken) return accessToken;
	if (browser) {
		const stored = sessionStorage.getItem('strikers.accessToken');
		if (stored) {
			accessToken = stored;
			return stored;
		}
	}
	return null;
}

// ---------- Axios instance ----------
export const api: AxiosInstance = axios.create({
	baseURL: BASE_URL,
	withCredentials: true, // send httpOnly refresh cookie
	headers: { 'Content-Type': 'application/json' }
});

// Request interceptor — attach Bearer token
api.interceptors.request.use((config) => {
	const token = getAccessToken();
	if (token && config.headers) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// Response interceptor — auto-refresh on 401
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
	(res) => res,
	async (error) => {
		const original = error.config as AxiosRequestConfig & { _retry?: boolean };

		// 401 + we have not already retried + not the refresh endpoint itself
		if (
			error.response?.status === 401 &&
			!original._retry &&
			!original.url?.includes('/api/auth/refresh') &&
			!original.url?.includes('/api/auth/login')
		) {
			if (isRefreshing) {
				// Wait for the in-flight refresh
				return new Promise((resolve, reject) => {
					refreshQueue.push((token) => {
						if (token && original.headers) {
							original.headers.Authorization = `Bearer ${token}`;
							resolve(api(original));
						} else {
							reject(error);
						}
					});
				});
			}

			original._retry = true;
			isRefreshing = true;

			try {
				const { data } = await axios.post(
					`${BASE_URL}/api/auth/refresh`,
					{},
					{ withCredentials: true }
				);
				const newToken = data?.data?.accessToken ?? null;
				setAccessToken(newToken);

				// Drain queue
				refreshQueue.forEach((cb) => cb(newToken));
				refreshQueue = [];

				if (newToken && original.headers) {
					original.headers.Authorization = `Bearer ${newToken}`;
					return api(original);
				}
			} catch (refreshErr) {
				refreshQueue.forEach((cb) => cb(null));
				refreshQueue = [];
				setAccessToken(null);
				// Optionally redirect to login here via app store
				if (browser) {
					window.location.href = '/login';
				}
				return Promise.reject(refreshErr);
			} finally {
				isRefreshing = false;
			}
		}

		return Promise.reject(error);
	}
);

// ---------- Helper: typed error extraction ----------
export function extractError(err: unknown): string {
	if (axios.isAxiosError(err)) {
		return err.response?.data?.message || err.message || 'Network error';
	}
	if (err instanceof Error) return err.message;
	return 'Unknown error';
}

// ---------- Helper: extract single entity from any response shape ----------
// Backend may return: {...}, { data: {...} }, { data: { drone: {...} } }, etc.
export function extractOne<T>(data: unknown, resourceKey?: string): T | null {
	if (!data || typeof data !== 'object') return null;
	const obj = data as Record<string, unknown>;
	// Try the resource key first (e.g., "drone", "operator", "mission")
	if (resourceKey && obj[resourceKey] && typeof obj[resourceKey] === 'object') {
		return obj[resourceKey] as T;
	}
	// If object has typical entity fields, assume it's the entity itself
	if ('_id' in obj || 'id' in obj) return obj as T;
	// Otherwise, find first object property as fallback
	for (const key of Object.keys(obj)) {
		const val = obj[key];
		if (val && typeof val === 'object' && !Array.isArray(val)) return val as T;
	}
	return obj as T;
}

// ---------- Helper: extract array from any response shape ----------
// Backend may return: [...], { data: [...] }, { data: { drones: [...] } }, etc.
export function extractList<T>(data: unknown, resourceKey?: string): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		// Try the resource key first (e.g., "drones", "operators")
		if (resourceKey && Array.isArray(obj[resourceKey])) return obj[resourceKey] as T[];
		// Try common keys
		if (Array.isArray(obj.data)) return obj.data as T[];
		if (Array.isArray(obj.items)) return obj.items as T[];
		if (Array.isArray(obj.results)) return obj.results as T[];
		// Find first array property as fallback
		for (const key of Object.keys(obj)) {
			if (Array.isArray(obj[key])) return obj[key] as T[];
		}
	}
	return [];
}
