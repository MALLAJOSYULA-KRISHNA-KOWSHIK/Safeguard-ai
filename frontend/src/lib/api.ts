import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({ baseURL: 'http://localhost:8000/api' });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        const { data } = await axios.post(
          'http://localhost:8000/api/auth/refresh',
          {},
          { headers: { Authorization: `Bearer ${refreshToken}` } },
        );
        useAuthStore.getState().setAccessToken(data.data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.data.access_token}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
