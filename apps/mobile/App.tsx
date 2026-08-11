import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { Loading, Screen } from './src/ui';
import { colors } from './src/theme';
import {
  SignIn,
  Goal,
  DiagnosticIntro,
  DiagnosticQuestion,
  Results,
  Home,
  Progress,
  Practice,
  AdminDashboard,
  type SkillNames,
} from './src/screens';
import {
  api,
  setAuthToken,
  googleClientId,
  googleIosClientId,
  googleAndroidClientId,
  type Degree,
  type DiagnosticResults,
  type PublicQuestion,
  type SkillProfileItem,
  type TargetEstimate,
} from './src/api';

WebBrowser.maybeCompleteAuthSession();

type ScreenName =
  | 'signin'
  | 'goal'
  | 'diagIntro'
  | 'diagnostic'
  | 'results'
  | 'home'
  | 'progress'
  | 'practice'
  | 'admin';

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [names, setNames] = useState<SkillNames>({});
  const [degreeName, setDegreeName] = useState('');
  const [targetScore, setTargetScore] = useState<number | undefined>(undefined);

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [asked, setAsked] = useState(0);

  const [results, setResults] = useState<DiagnosticResults | null>(null);
  const [skills, setSkills] = useState<SkillProfileItem[]>([]);
  const [target, setTarget] = useState<TargetEstimate | null>(null);

  // Optional Google sign-in (only active when a client id is configured).
  const [, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: googleClientId ?? '',
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
  });

  async function guard(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function loadCatalog(): Promise<void> {
    const [{ degrees: ds }, { skills: cat }] = await Promise.all([
      api.getDegrees(),
      api.getSkillCatalog(),
    ]);
    setDegrees(ds);
    setNames(Object.fromEntries(cat.map((s) => [s.id, s.name.ca])));
  }

  async function enterAsStudent(sid: string): Promise<void> {
    setStudentId(sid);
    await loadCatalog();
    setScreen('goal');
  }

  const startAnonymous = (): Promise<void> =>
    guard(async () => {
      const student = await api.createStudent();
      await enterAsStudent(student.id);
    });

  const devStudent = (): Promise<void> =>
    guard(async () => {
      const res = await api.devLogin('student');
      setAuthToken(res.token);
      if (res.studentId) await enterAsStudent(res.studentId);
    });

  const devAdmin = (): Promise<void> =>
    guard(async () => {
      const res = await api.devLogin('admin');
      setAuthToken(res.token);
      setScreen('admin');
    });

  // Complete Google sign-in when the auth session returns an id token.
  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = (googleResponse.params as Record<string, string>)?.id_token;
    if (!idToken) return;
    void guard(async () => {
      const res = await api.googleLogin(idToken, studentId ?? undefined);
      setAuthToken(res.token);
      if (res.role === 'admin') {
        setScreen('admin');
      } else if (res.studentId) {
        await enterAsStudent(res.studentId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const chooseGoal = (degreeId: string, target?: number): Promise<void> =>
    guard(async () => {
      if (!studentId) return;
      await api.createGoal(studentId, degreeId, target);
      setDegreeName(degrees.find((d) => d.id === degreeId)?.name.ca ?? degreeId);
      setTargetScore(target);
      setScreen('diagIntro');
    });

  const startDiagnostic = (): Promise<void> =>
    guard(async () => {
      if (!studentId) return;
      const start = await api.startAssessment(studentId);
      setAssessmentId(start.assessmentId);
      setQuestion(start.question);
      setAsked(0);
      setScreen('diagnostic');
    });

  const answer = (optionId?: string, idk?: boolean): Promise<void> =>
    guard(async () => {
      if (!assessmentId || !question) return;
      const res = await api.submitResponse(assessmentId, question.id, optionId, idk);
      setAsked((n) => n + 1);
      if (res.done) {
        setResults(await api.completeAssessment(assessmentId));
        setScreen('results');
      } else {
        setQuestion(res.question);
      }
    });

  const goHome = (): Promise<void> =>
    guard(async () => {
      if (studentId) {
        const [{ skills: s }, est] = await Promise.all([
          api.getSkills(studentId),
          api.getTargetEstimate(studentId),
        ]);
        setSkills(s);
        setTarget(est);
      }
      setScreen('home');
    });

  const openProgress = (): Promise<void> =>
    guard(async () => {
      if (studentId) setSkills((await api.getSkills(studentId)).skills);
      setScreen('progress');
    });

  function signOut(): void {
    setAuthToken(null);
    setStudentId(null);
    setResults(null);
    setSkills([]);
    setTarget(null);
    setScreen('signin');
  }

  const recommendation = results?.recommendation ?? null;

  let body;
  if (busy && screen !== 'diagnostic') {
    body = <Screen><Loading /></Screen>;
  } else {
    switch (screen) {
      case 'signin':
        body = (
          <SignIn
            onStartAnonymous={startAnonymous}
            onDevStudent={devStudent}
            onDevAdmin={devAdmin}
            onGoogle={() => void promptGoogle()}
            googleEnabled={Boolean(googleClientId)}
            busy={busy}
          />
        );
        break;
      case 'goal':
        body = <Goal degrees={degrees} onChoose={chooseGoal} busy={busy} />;
        break;
      case 'diagIntro':
        body = <DiagnosticIntro onStart={startDiagnostic} busy={busy} />;
        break;
      case 'diagnostic':
        body = question ? (
          <DiagnosticQuestion question={question} asked={asked} onAnswer={answer} busy={busy} />
        ) : (
          <Screen><Loading /></Screen>
        );
        break;
      case 'results':
        body = results ? (
          <Results
            results={results}
            targetScore={targetScore}
            names={names}
            onStartSession={() => setScreen('practice')}
            onHome={goHome}
          />
        ) : null;
        break;
      case 'home':
        body = (
          <Home
            degreeName={degreeName}
            level={results?.level}
            targetScore={targetScore}
            recommendation={recommendation}
            target={target}
            names={names}
            onTrain={() => setScreen('practice')}
            onProgress={openProgress}
          />
        );
        break;
      case 'progress':
        body = <Progress skills={skills} names={names} onHome={goHome} />;
        break;
      case 'practice':
        body = studentId ? (
          <Practice studentId={studentId} names={names} onDone={goHome} />
        ) : null;
        break;
      case 'admin':
        body = <AdminDashboard onSignOut={signOut} />;
        break;
    }
  }

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {body}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  error: { backgroundColor: '#FDE8E8', padding: 12 },
  errorText: { color: colors.danger, textAlign: 'center' },
});
