import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  role: 'admin' | 'supervisor' | 'manager' | 'worker' | null;
  email: string | null;
  name: string | null;
  zone_id: string | null;
  supervisor_id: number | null;
  isAuthenticated: boolean;
  setAuth: (
    accessToken: string,
    refreshToken: string,
    role: AuthState['role'],
    email: string,
    name?: string | null,
    zone_id?: string | null,
    supervisor_id?: number | null
  ) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  role: null,
  email: null,
  name: null,
  zone_id: null,
  supervisor_id: null,
  isAuthenticated: false,
  setAuth: (accessToken, refreshToken, role, email, name = null, zone_id = null, supervisor_id = null) =>
    set({ accessToken, refreshToken, role, email, name: name ?? null, zone_id: zone_id ?? null, supervisor_id: supervisor_id ?? null, isAuthenticated: true }),
  setAccessToken: (token) => set({ accessToken: token }),
  clearAuth: () => set({ accessToken: null, refreshToken: null, role: null, email: null, name: null, zone_id: null, supervisor_id: null, isAuthenticated: false }),
}));

export default useAuthStore;
