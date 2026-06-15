import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Camera, Clock } from 'lucide-react';
import api from '../lib/api';
import { getSocket } from '../lib/socket';

const PPECheckScreen = () => {
  const [result, setResult] = useState<{ passed: boolean; missing_items: string[]; detected_ppe?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'waiting'|'approved'|'denied'|null>(null);
  const socketRef = useRef<any>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { worker_id?: string; name?: string; language?: string } | null;

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

  const handleVerify = async () => {
    setError('');
    setLoading(true);
    try {
      const image_base64 = captureFrame();
      if (!image_base64) {
        setError('Could not capture image. Make sure camera is ready.');
        setLoading(false);
        return;
      }

      const res = await fetch(image_base64);
      const blob = await res.blob();
      
      const formData = new FormData();
      formData.append('image', blob, 'ppe.jpg');
      if (state?.worker_id) {
        formData.append('worker_id', state.worker_id);
      }

      const response = await api.post('/kiosk/verify-ppe', formData);
      const data = response.data.data;
      setResult(data);
      
      if (data.passed) {
        setTimeout(() => {
          navigate('/kiosk');
        }, 3000);
      } else if (data.requires_approval) {
        const token = data.approval_token;
        setApprovalToken(token);
        setApprovalStatus('waiting');
        
        const socket = getSocket();
        socketRef.current = socket;
        
        // Join kiosk private room
        const handleJoinKiosk = () => {
          console.log('Socket connected. Joining kiosk room for token:', token);
          socket.emit('join_kiosk_room', { token });
        };
        
        if (socket.connected) {
          handleJoinKiosk();
        }
        socket.on('connect', handleJoinKiosk);
        
        socket.once('ppe_approval_resolved', (resolvedData: { status: string }) => {
          setApprovalStatus(resolvedData.status === 'approved' ? 'approved' : 'denied');
          socket.off('ppe_approval_resolved');
          
          setTimeout(() => {
            setApprovalToken(null);
            setApprovalStatus(null);
            navigate('/kiosk');
          }, resolvedData.status === 'approved' ? 5000 : 8000);
        });

        // Timeout after 2 minutes
        setTimeout(() => {
          setApprovalStatus((prev) => {
            if (prev === 'waiting') {
              setApprovalToken(null);
              socket.off('ppe_approval_resolved');
              return null;
            }
            return prev;
          });
        }, 120000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Verification failed.');
      setResult(null);
      setApprovalStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 text-gray-900 font-sans">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">PPE Verification</h1>
          <p className="mt-2 text-base font-medium text-gray-500">
            {state?.name ? <span className="font-semibold text-blue-600">Welcome {state.name}. </span> : ''}
            Confirm you have the required PPE before entry.
          </p>
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
          {!cameraReady && (
            <div className="flex h-64 items-center justify-center text-sm font-medium text-gray-500">
              Starting camera...
            </div>
          )}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />

        {error && !approvalStatus && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {approvalStatus === 'waiting' && result && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
            <div className="flex justify-center gap-1 mb-4">
              {[0, 1, 2].map(i => (
                <span key={i} className="h-3 w-3 rounded-full bg-amber-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="font-bold text-amber-800 text-lg">Waiting for supervisor approval</p>
            <p className="text-amber-700 text-sm mt-1">Your supervisor has been notified. Please wait...</p>
            <div className="mt-4 text-left">
              <p className="text-xs font-semibold text-amber-700 mb-1">Missing PPE:</p>
              <ul className="list-disc list-inside text-sm text-amber-800">
                {result.missing_items.map((i: string) => <li key={i}>{i.charAt(0).toUpperCase() + i.slice(1).replace('_', ' ')}</li>)}
              </ul>
            </div>
          </div>
        )}

        {approvalStatus === 'approved' && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
            <p className="text-5xl mb-3">✅</p>
            <p className="font-bold text-green-800 text-xl">Entry Approved</p>
            <p className="text-green-700 text-sm mt-2">Your supervisor approved your entry. Please proceed.</p>
            <p className="text-xs text-green-600 mt-3">Redirecting in 5 seconds...</p>
          </div>
        )}

        {approvalStatus === 'denied' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
            <p className="text-5xl mb-3">❌</p>
            <p className="font-bold text-red-800 text-xl">Entry Denied</p>
            <p className="text-red-700 text-sm mt-2">Please contact your supervisor before entering.</p>
            <p className="text-xs text-red-600 mt-3">Redirecting in 8 seconds...</p>
          </div>
        )}

        {result && !approvalStatus && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-5 text-left text-gray-900 shadow-sm">
            {result.passed ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <p className="text-green-700 font-bold">All PPE verified. Check-in successful.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <XCircle className="h-6 w-6 text-red-600" />
                  <p className="text-red-700 font-bold">Missing PPE items:</p>
                </div>
                <ul className="mt-2 list-disc pl-8 text-sm font-medium text-red-600">
                  {result.missing_items.map((item) => (
                    <li key={item} className="capitalize">{item.replace('_', ' ')}</li>
                  ))}
                </ul>
                
                {result.detected_ppe && result.detected_ppe.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <p className="text-green-700 font-bold text-sm">Detected PPE items:</p>
                    </div>
                    <ul className="mt-1 list-disc pl-8 text-sm font-medium text-green-600">
                      {result.detected_ppe.map((item) => (
                        <li key={item} className="capitalize">{item.replace('_', ' ')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        
        <div className="space-y-3">
          <button
            onClick={handleVerify}
            disabled={loading || !cameraReady || result?.passed || approvalStatus !== null}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? 'Verifying...' : <><Camera className="h-6 w-6" /> Verify PPE</>}
          </button>
          
          <button
            onClick={() => navigate('/kiosk')}
            className="w-full rounded-md border border-gray-300 bg-white px-6 py-4 text-lg font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PPECheckScreen;
