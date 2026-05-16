import { api, setAccessToken } from './client';
import type {
	ApiResponse,
	LoginRequest,
	LoginResponse,
	RegisterRequest,
	User,
	ChangePasswordRequest
} from '$lib/types';

export const authApi = {
	async login(payload: LoginRequest): Promise<LoginResponse> {
		const { data } = await api.post<ApiResponse<LoginResponse>>('/api/auth/login', payload);
		if (data.data?.accessToken) setAccessToken(data.data.accessToken);
		return data.data as LoginResponse;
	},

	async register(payload: RegisterRequest): Promise<LoginResponse> {
		const { data } = await api.post<ApiResponse<LoginResponse>>('/api/auth/register', payload);
		if (data.data?.accessToken) setAccessToken(data.data.accessToken);
		return data.data as LoginResponse;
	},

	async logout(): Promise<void> {
		try {
			await api.post('/api/auth/logout');
		} finally {
			setAccessToken(null);
		}
	},

	async me(): Promise<User> {
		const { data } = await api.get<ApiResponse<{ user: User }>>('/api/auth/me');
		return data.data?.user as User;
	},

	async updateProfile(payload: Partial<Pick<User, 'name' | 'organisation' | 'avatarUrl'>>): Promise<User> {
		const { data } = await api.patch<ApiResponse<{ user: User }>>('/api/auth/me', payload);
		return data.data?.user as User;
	},

	async changePassword(payload: ChangePasswordRequest): Promise<void> {
		await api.patch('/api/auth/change-password', payload);
	}
};
