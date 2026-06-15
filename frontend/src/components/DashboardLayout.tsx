import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Activity, 
  AlertTriangle, 
  Map, 
  Users, 
  ClipboardList, 
  Trophy, 
  FileBarChart, 
  Settings, 
  ShieldCheck,
  LogOut
} from 'lucide-react';
import useAuthStore from '../store/authStore';

const ADMIN_NAV = [
  { label: 'Manager Settings', path: '/settings', icon: Settings },
];

const SUPERADMIN_NAV = [
  { label: 'Admin Management', path: '/superadmin', icon: Users },
];

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearAuth, role } = useAuthStore((state) => ({
    clearAuth: state.clearAuth,
    role: state.role
  }));

  const nav = role === 'superadmin' ? SUPERADMIN_NAV : ADMIN_NAV;

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans">
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white p-6 shadow-sm z-10">
        <div className="mb-10 text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" /> SafeGuard AI
        </div>
        <nav className="flex-1 space-y-1.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-all duration-200
                  ${isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                    : 'text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-100 transition-colors shadow-sm"
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
};

export default DashboardLayout;