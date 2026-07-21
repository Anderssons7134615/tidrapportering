import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardDetail = lazy(() => import('./pages/DashboardDetail'));
const TimeEntry = lazy(() => import('./pages/TimeEntry'));
const WeekView = lazy(() => import('./pages/WeekView'));
const TeamWeekOverview = lazy(() => import('./pages/TeamWeekOverview'));
const Approval = lazy(() => import('./pages/Approval'));
const Customers = lazy(() => import('./pages/Customers'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Activities = lazy(() => import('./pages/Activities'));
const Materials = lazy(() => import('./pages/Materials'));
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

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function WorkRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !['ADMIN', 'SUPERVISOR', 'EMPLOYEE'].includes(user.role)) {
    return <Navigate to="/reports" replace />;
  }
  return <>{children}</>;
}

function ReportRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user || !['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function HomeRoute() {
  const { user } = useAuthStore();
  if (user?.role === 'ACCOUNTANT') {
    return <Navigate to="/reports" replace />;
  }
  return <PageLoader><Dashboard /></PageLoader>;
}

function PageLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="task-section flex min-h-[260px] items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PageLoader><Login /></PageLoader>} />
      <Route path="/register" element={<PageLoader><Register /></PageLoader>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRoute />} />
        <Route path="overview/details/:metric" element={<WorkRoute><PageLoader><DashboardDetail /></PageLoader></WorkRoute>} />
        <Route path="time-entry" element={<WorkRoute><PageLoader><TimeEntry /></PageLoader></WorkRoute>} />
        <Route path="week" element={<WorkRoute><PageLoader><WeekView /></PageLoader></WorkRoute>} />
        <Route
          path="team-week"
          element={
            <AdminRoute>
              <PageLoader><TeamWeekOverview /></PageLoader>
            </AdminRoute>
          }
        />
        <Route
          path="approval"
          element={
            <AdminRoute>
              <PageLoader><Approval /></PageLoader>
            </AdminRoute>
          }
        />
        <Route
          path="customers"
          element={
            <AdminRoute>
              <PageLoader><Customers /></PageLoader>
            </AdminRoute>
          }
        />
        <Route
          path="projects"
          element={
            <ProtectedRoute>
              <PageLoader><Projects /></PageLoader>
            </ProtectedRoute>
          }
        />
        <Route
          path="projects/:id"
          element={
            <ProtectedRoute>
              <PageLoader><ProjectDetail /></PageLoader>
            </ProtectedRoute>
          }
        />
        <Route
          path="materials"
          element={
            <AdminRoute>
              <PageLoader><Materials /></PageLoader>
            </AdminRoute>
          }
        />
        <Route
          path="activities"
          element={
            <AdminOnlyRoute>
              <PageLoader><Activities /></PageLoader>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminOnlyRoute>
              <PageLoader><Users /></PageLoader>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ReportRoute>
              <PageLoader><Reports /></PageLoader>
            </ReportRoute>
          }
        />
        <Route path="settings" element={<PageLoader><Settings /></PageLoader>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
