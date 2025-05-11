import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function useTrackUser() {
  useEffect(() => {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem('userId', userId);
    }
    fetch(`${API_BASE_URL}/l/u`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    })
    .catch(error => {
      console.error('Fetch error in useTrackUser:', error); 
    });
  }, []);
}

export default useTrackUser;