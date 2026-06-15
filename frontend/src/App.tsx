import { Route, Routes, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import LiveMonitoring from './pages/LiveMonitoring';
import ViolationsLog from './pages/ViolationsLog';
import ViolationHeatmap from './pages/ViolationHeatmap';
import SafetyLeaderboard from './pages/SafetyLeaderboard';
import ComplianceReports from './pages/ComplianceReports';
import Settings from './pages/Settings';
import AttendanceLog from './pages/AttendanceLog';
import SupervisorDashboard from './pages/SupervisorDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import WorkerManagement from './pages/WorkerManagement';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import KioskLayout from './kiosk/KioskLayout';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import useAuthStore from './store/authStore';

const App = () => {
  const { isAuthenticated, role } = useAuthStore();

  const defaultRedirect = isAuthenticated
    ? role === 'superadmin' ? '/superadmin' : role === 'worker' ? '/kiosk' : role === 'manager' ? '/manager' : role === 'supervisor' ? '/supervisor' : '/settings'
    : '/login';

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><LiveMonitoring /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/violations" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><ViolationsLog /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/heatmap" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><ViolationHeatmap /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/workers" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><WorkerManagement /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/attendance" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><AttendanceLog /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/leaderboard" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><SafetyLeaderboard /></DashboardLayout>
        </ProtectedRoute>
      } />



      <Route path="/settings" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><Settings /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/manager" element={
        <ProtectedRoute allowedRoles={['manager']}>
          <ManagerDashboard />
        </ProtectedRoute>
      } />

      <Route path="/supervisor" element={
        <ProtectedRoute allowedRoles={['supervisor']}>
          <SupervisorDashboard />
        </ProtectedRoute>
      } />

      <Route path="/superadmin" element={
        <ProtectedRoute allowedRoles={['superadmin']}>
          <DashboardLayout><SuperAdminDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Kiosk is PUBLIC — no auth needed */}
      <Route path="/kiosk/*" element={<KioskLayout />} />

      <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
    </Routes>
  );
};

export default App;