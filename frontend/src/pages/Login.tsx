import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, HardHat, Eye, EyeOff } from 'lucide-react';
import api from '../lib/api';
import useAuthStore from '../store/authStore';

const Login = () => {
  const [email, setEmail] = useState('admin@safeguard.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, refresh_token, role, email: userEmail, name, zone_id, supervisor_id } = response.data.data;
      setAuth(access_token, refresh_token, role, userEmail, name, zone_id, supervisor_id);
      if (role === 'superadmin') {
        navigate('/superadmin');
      } else if (role === 'worker') {
        navigate('/kiosk');
      } else if (role === 'supervisor') {
        navigate('/supervisor');
      } else if (role === 'manager') {
        navigate('/manager');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Invalid credentials.');
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4 font-sans">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-10 shadow-lg shadow-gray-200/50">
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            <ShieldCheck className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">SafeGuard AI</h1>
          <p className="mt-2 text-sm font-medium text-gray-500">PPE Compliance & Safety Monitoring</p>
        </div>

        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex gap-2">
          <HardHat className="h-5 w-5 shrink-0" />
          <span><strong>Workers:</strong> Please use the <strong>Kiosk</strong> for face scan entry — no login needed.</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Admin / Manager / Supervisor Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow shadow-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 pr-10 text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-shadow shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            Sign in
          </button>
        </form>

        <div className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Demo Accounts
          </p>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 last:border-0 last:pb-0">
              <span className="font-medium">Super Admin</span>
              <span className="text-gray-500 font-mono text-xs">superadmin@safeguard.com / admin123</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 last:border-0 last:pb-0">
              <span className="font-medium">Admin</span>
              <span className="text-gray-500 font-mono text-xs">admin@safeguard.com / admin123</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 last:border-0 last:pb-0">
              <span className="font-medium">Manager</span>
              <span className="text-gray-500 font-mono text-xs text-right">kkowshik03@gmail.com<br/>admin@123</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 last:border-0 last:pb-0">
              <span className="font-medium">Supervisor 1</span>
              <span className="text-gray-500 font-mono text-xs text-right">kowshik03@gmail.com<br/>admin@123</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 last:border-0 last:pb-0">
              <span className="font-medium">Supervisor 2</span>
              <span className="text-gray-500 font-mono text-xs text-right">rohan@gmail.com<br/>admin@123</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/kiosk"
            className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
          >
            → Go to Worker Kiosk
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;