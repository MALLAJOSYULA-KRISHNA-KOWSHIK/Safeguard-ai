import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

const CheckOutScreen = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { worker_id?: string; name?: string; language?: string } | null;

  const handleCheckOut = async () => {
    if (!state?.worker_id) return;
    
    setError('');
    setLoading(true);
    try {
      await api.post('/kiosk/check-out', { worker_id: state.worker_id });
      setSuccess(true);
      
      const text = state.language === 'hi'
        ? `चेक-आउट सफल। शुभ दिन ${state.name}`
        : `Check-out successful. Have a good day, ${state.name}`;
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = state.language === 'hi' ? 'hi-IN' : 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
      
      setTimeout(() => {
        navigate('/kiosk');
      }, 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Check-out failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 text-gray-900 font-sans">
      <div className="w-full max-w-lg space-y-6 text-center">
        {!success ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Check Out</h1>
            <p className="mt-2 text-base font-medium text-gray-500">
              {state?.name ? <span className="font-semibold text-blue-600">Welcome {state.name}. </span> : ''}
              You are currently checked in. Would you like to check out?
            </p>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <div className="mt-8 space-y-3">
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
              >
                {loading ? 'Processing...' : <><LogOut className="h-6 w-6" /> Confirm Check Out</>}
              </button>
              
              <button
                onClick={() => navigate('/kiosk')}
                className="w-full rounded-md border border-gray-300 bg-white px-6 py-4 text-lg font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-10">
            <CheckCircle2 className="h-24 w-24 text-green-500 mb-6" />
            <h2 className="text-3xl font-bold text-gray-900">Checked Out Successfully</h2>
            <p className="mt-4 text-lg text-gray-600">Have a great day!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckOutScreen;
