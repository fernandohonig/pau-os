import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { setAuthToken, getAuthToken, type AuthResult, type DiagnosticResults } from './api';

type Role = 'student' | 'admin';

interface SessionState {
  token: string | null;
  role: Role | null;
  studentId: string | null;
  /** Latest diagnostic results, kept so Results/Home can render after navigation. */
  results: DiagnosticResults | null;
}

interface SessionValue extends SessionState {
  signInWith: (res: AuthResult) => void;
  setStudentId: (id: string | null) => void;
  setResults: (r: DiagnosticResults | null) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

const ROLE_KEY = 'pau-role';
const STUDENT_KEY = 'pau-student';

function readInitial(): SessionState {
  let role: Role | null = null;
  let studentId: string | null = null;
  try {
    const r = localStorage.getItem(ROLE_KEY);
    role = r === 'student' || r === 'admin' ? r : null;
    studentId = localStorage.getItem(STUDENT_KEY);
  } catch {
    /* ignore */
  }
  return { token: getAuthToken(), role, studentId, results: null };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(readInitial);

  const persist = useCallback((role: Role | null, studentId: string | null) => {
    try {
      if (role) localStorage.setItem(ROLE_KEY, role);
      else localStorage.removeItem(ROLE_KEY);
      if (studentId) localStorage.setItem(STUDENT_KEY, studentId);
      else localStorage.removeItem(STUDENT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const signInWith = useCallback(
    (res: AuthResult) => {
      setAuthToken(res.token);
      persist(res.role, res.studentId);
      setState((s) => ({ ...s, token: res.token, role: res.role, studentId: res.studentId }));
    },
    [persist],
  );

  const setStudentId = useCallback(
    (id: string | null) => {
      setState((s) => {
        persist(s.role, id);
        return { ...s, studentId: id };
      });
    },
    [persist],
  );

  const setResults = useCallback((r: DiagnosticResults | null) => {
    setState((s) => ({ ...s, results: r }));
  }, []);

  const signOut = useCallback(() => {
    setAuthToken(null);
    persist(null, null);
    setState({ token: null, role: null, studentId: null, results: null });
  }, [persist]);

  const value = useMemo<SessionValue>(
    () => ({ ...state, signInWith, setStudentId, setResults, signOut }),
    [state, signInWith, setStudentId, setResults, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
