import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useSession } from './session';
import { SignIn } from './screens/SignIn';
import { Goal } from './screens/Goal';
import { Diagnostic } from './screens/Diagnostic';
import { Results } from './screens/Results';
import { Home } from './screens/Home';
import { Progress } from './screens/Progress';
import { Practice } from './screens/Practice';
import { Admin } from './screens/Admin';
import { AdminReview } from './screens/AdminReview';

/** Requires an active student (anonymous or logged in). */
function RequireStudent({ children }: { children: ReactNode }) {
  const { studentId } = useSession();
  return studentId ? <>{children}</> : <Navigate to="/" replace />;
}

/** Requires an admin token. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { role } = useSession();
  return role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/goal" element={<RequireStudent><Goal /></RequireStudent>} />
        <Route path="/diagnostic" element={<RequireStudent><Diagnostic /></RequireStudent>} />
        <Route path="/results" element={<RequireStudent><Results /></RequireStudent>} />
        <Route path="/home" element={<RequireStudent><Home /></RequireStudent>} />
        <Route path="/progress" element={<RequireStudent><Progress /></RequireStudent>} />
        <Route path="/practice" element={<RequireStudent><Practice /></RequireStudent>} />
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/admin/review" element={<RequireAdmin><AdminReview /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
