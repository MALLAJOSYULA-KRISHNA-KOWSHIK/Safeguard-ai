import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ScanFace } from 'lucide-react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const FaceScanScreen = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { role } = useAuthStore();

  // Start webcam on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraReady(true);
      }
    } catch {
      setError('Camera access denied. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }
  };

  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL('image/jpeg');
  };

  const handleScan = async () => {
    setError('');
    setLoading(true);
    try {
      const image_base64 = captureFrame();
      if (!image_base64) {
       setError('Could not capture image. Make sure camera is ready.');
        setLoading(false);
        return;
      }

      // ← fixed: no trailing slash
      const result = await api.post('/kiosk/scan-face', { image_base64 });
      const { worker_id, name, language, status, attendance_state } = result.data.data;

      if (status === 'verified' && worker_id) {
        // Speak confirmation in worker's language
        speak(
          language === 'hi'
            ? `पहचान सत्यापित। स्वागत है ${name}`
            : `Identity confirmed. Welcome ${name}`,
          language
        );
        stopCamera();
        
        if (attendance_state === 'checked_in') {
          navigate('/kiosk/checkout', { state: { worker_id, name, language } });
        } else {
          navigate('/kiosk/ppe', { state: { worker_id, name, language } });
        }
      } else {
        setError('Face not recognized. Please try again or contact supervisor.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Face scan request failed.');
    } finally {
      setLoading(false);
    }
  };

  const speak = (text: string, lang: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 text-gray-900 font-sans">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mb-3 flex justify-center">
            <User className="h-12 w-12 text-gray-900" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Face Verification</h1>
          <p className="mt-2 text-base font-medium text-gray-500">Look at the camera and press Scan</p>
        </div>

        {/* Camera feed */}
        <div className="relative overflow-hidden rounded-xl border border-gray-300 bg-gray-50 shadow-inner">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full"
          />
          {/* Scan overlay */}
          {cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-full border-4 border-blue-500 opacity-70 animate-pulse shadow-lg"
                 style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)' }} />
            </div>
          )}
          {!cameraReady && (
            <div className="flex h-64 items-center justify-center text-sm font-medium text-gray-500">
              Starting camera...
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={loading || !cameraReady}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? 'Scanning...' : <><ScanFace className="h-6 w-6" /> Scan Face</>}
        </button>

        <p className="text-center text-xs font-semibold text-gray-500">
          कैमरे की तरफ देखें और स्कैन करें
        </p>
      </div>
    </div>
  );
};

export default FaceScanScreen;