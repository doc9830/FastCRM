import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true, // send httpOnly cookies on every request
});

// Simple interceptor: on 401, just reject — no redirect, no refresh loop.
// App.jsx decides what to show based on user state.
// The only place we try a silent refresh is when CRM is already loaded
// and an access token expires mid-session (handled by App via onSessionExpired).
api.interceptors.response.use(
  r => r,
  err => Promise.reject(err)
);

export default api;
