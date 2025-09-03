import axios from "axios";

const getBaseURL = () => {
  // ใน production ใช้ environment variable
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_API_URL || 'https://your-backend-name.railway.app';
  }
  // ใน development ใช้ localhost
  return 'http://localhost:8000';
};

export const BASE_URL = getBaseURL();

// สร้าง axios instance
const api = axios.create({
  baseURL: BASE_URL, // URL ของ Backend API
  timeout: 30000, // 30 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log("API Request:", config.method?.toUpperCase(), config.url, config.data);
    return config;
  },
  (error) => {
    console.error("Request Error:", error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log("API Response:", response.status, response.config.url, response.data);
    return response;
  },
  (error) => {
    console.error("Response Error:", error.response?.status, error.response?.data);

    if (error.response?.status === 404) {
      console.warn("Resource not found:", error.config.url);
    }

    if (error.response?.status >= 500) {
      console.error("Server error:", error.response.data);
    }

    return Promise.reject(error);
  }
);

// WebSocket URL helper
export const getWebSocketURL = () => {
  const baseURL = getBaseURL();
  const isSecure = baseURL.startsWith('https');
  const host = baseURL.replace(/^https?:\/\//, '');
  const protocol = isSecure ? 'wss' : 'ws';
  return `${protocol}://${host}/ws/realtime`;
};

export default api;