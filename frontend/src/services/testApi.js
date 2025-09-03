import api from './api';

// ฟังก์ชันทดสอบ API
export const testApiConnection = async () => {
  try {
    console.log('Testing API connection...');
    
    // ทดสอบเรียก endpoint ที่มีอยู่
    const response = await api.get('/api/locations');
    console.log('API connection successful:', response.data);
    return true;
  } catch (error) {
    console.error('API connection failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('Backend server is not running on http://localhost:8000');
    }
    
    return false;
  }
};