import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TimeEntry = lazy(() => import('./pages/TimeEntry'));
const WeekView = lazy(() => import('./pages/WeekView'));
const Approval = lazy(() => import('./pages/Approval'));
const Customers = lazy(() => import('./pages/Customers'));
const Projects = lazy(() => import('./pages/Projects'));
const Activities = lazy(() => import('./pages/Activities'));
const Users = lazy(() => import('./pages/Users'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !['ADMIN', 'SUPERVISOR'].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="time-entry" element={<TimeEntry />} />
        <Route path="week" element={<WeekView />} />
        <Route
          path="approval"
          element={
            <AdminRoute>
              <Approval />
            </AdminRoute>
          }
        />
        <Route
          path="customers"
          element={
            <AdminRoute>
              <Customers />
            </AdminRoute>
          }
        />
        <Route
          path="projects"
          element={
            <AdminRoute>
              <Projects />
            </AdminRoute>
          }
        />
        <Route
          path="activities"
          element={
            <AdminRoute>
              <Activities />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
        <Route
          path="reports"
          element={
            <AdminRoute>
              <Reports />
            </AdminRoute>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
