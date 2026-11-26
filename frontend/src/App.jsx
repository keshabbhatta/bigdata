import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, isStaff } from './context/AuthContext.jsx';
import { SyncProvider } from './context/SyncContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Patients } from './pages/Patients.jsx';
import { PatientDetail } from './pages/PatientDetail.jsx';
import { MaternalHealth } from './pages/MaternalHealth.jsx';
import { VisitHistory } from './pages/VisitHistory.jsx';
import { SyncStatus } from './pages/SyncStatus.jsx';
import { Conflicts } from './pages/Conflicts.jsx';
import { MyHealth } from './pages/MyHealth.jsx';

// Charts and the admin screen are loaded on demand to keep the first download small.
const Analytics = lazy(() => import('./pages/Analytics.jsx').then((m) => ({ default: m.Analytics })));
const Admin = lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m.Admin })));
const Home = lazy(() => import('./pages/Home.jsx').then((m) => ({ default: m.Home })));
const ProblemDetail = lazy(() => import('./pages/ProblemDetail.jsx').then((m) => ({ default: m.ProblemDetail })));

function RequireAuth({ children }) {
  const { session } = useAuth();
  return session ? children : <Navigate to="/home" replace />;
}

// Patients only have their own "My health" page and the sync screen.
function NotPatient({ children }) {
  const { user } = useAuth();
  return user?.role === 'patient' ? <Navigate to="/" replace /> : children;
}

function Start() {
  const { user } = useAuth();
  return user?.role === 'patient' ? <MyHealth /> : <Dashboard />;
}

function StaffOnly({ children }) {
  const { user } = useAuth();
  return isStaff(user) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SyncProvider>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/home" element={<Home />} />
                <Route path="/problems/:slug" element={<ProblemDetail />} />
                <Route path="/login" element={<Login />} />
                <Route element={<RequireAuth><Layout /></RequireAuth>}>
                  <Route index element={<Start />} />
                  <Route path="patients" element={<NotPatient><Patients /></NotPatient>} />
                  <Route path="patients/:id" element={<NotPatient><PatientDetail /></NotPatient>} />
                  <Route path="maternal" element={<NotPatient><MaternalHealth /></NotPatient>} />
                  <Route path="visits" element={<NotPatient><VisitHistory /></NotPatient>} />
                  <Route path="sync" element={<SyncStatus />} />
                  <Route path="conflicts" element={<NotPatient><Conflicts /></NotPatient>} />
                  <Route path="analytics" element={<NotPatient><Analytics /></NotPatient>} />
                  <Route path="admin" element={<StaffOnly><Admin /></StaffOnly>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </SyncProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
