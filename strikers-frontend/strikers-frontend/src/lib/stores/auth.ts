import { writable, derived } from 'svelte/store';
import type { User } from '$lib/types';

export const user = writable<User | null>(null);

export const isAuthenticated = derived(user, ($u) => $u !== null);

export const isCommander = derived(user, ($u) => $u?.role === 'super_admin');

export const isOperator = derived(user, ($u) => $u?.role === 'operator');
