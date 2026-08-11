import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { Loading, Screen } from './src/ui';
import { colors } from './src/theme';
import {
  Welcome,
  Goal,
  DiagnosticIntro,
  DiagnosticQuestion,
  Results,
  Home,
  Progress,
  Practice,
  type SkillNames,
} from './src/screens';
import {
  api,
  type Degree,
  type DiagnosticResults,
  type PublicQuestion,
  type SkillProfileItem,
  type TargetEstimate,
} from './src/api';

type ScreenName =
  | 'welcome'
  | 'goal'
  | 'diagIntro'
  | 'diagnostic'
  | 'results'
  | 'home'
  | 'progress'
  | 'practice';

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('welcome');
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

  async function guard(fn: () => Promise<void>) {
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

  const begin = () =>
    guard(async () => {
      const student = await api.createStudent();
      setStudentId(student.id);
      const [{ degrees: ds }, { skills: cat }] = await Promise.all([
        api.getDegrees(),
        api.getSkillCatalog(),
      ]);
      setDegrees(ds);
      setNames(Object.fromEntries(cat.map((s) => [s.id, s.name.ca])));
      setScreen('goal');
    });

  const chooseGoal = (degreeId: string, target?: number) =>
    guard(async () => {
      if (!studentId) return;
      await api.createGoal(studentId, degreeId, target);
      setDegreeName(degrees.find((d) => d.id === degreeId)?.name.ca ?? degreeId);
      setTargetScore(target);
      setScreen('diagIntro');
    });

  const startDiagnostic = () =>
    guard(async () => {
      if (!studentId) return;
      const start = await api.startAssessment(studentId);
      setAssessmentId(start.assessmentId);
      setQuestion(start.question);
      setAsked(0);
      setScreen('diagnostic');
    });

  const answer = (optionId?: string, idk?: boolean) =>
    guard(async () => {
      if (!assessmentId) return;
      const current = question;
      if (!current) return;
      const res = await api.submitResponse(assessmentId, current.id, optionId, idk);
      setAsked((n) => n + 1);
      if (res.done) {
        const r = await api.completeAssessment(assessmentId);
        setResults(r);
        setScreen('results');
      } else {
        setQuestion(res.question);
      }
    });

  const goHome = () =>
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

  const openProgress = () =>
    guard(async () => {
      if (studentId) {
        const { skills: s } = await api.getSkills(studentId);
        setSkills(s);
      }
      setScreen('progress');
    });

  const recommendation = results?.recommendation ?? null;

  let body;
  if (busy && screen !== 'diagnostic') {
    body = <Screen><Loading /></Screen>;
  } else {
    switch (screen) {
      case 'welcome':
        body = <Welcome onStart={begin} busy={busy} />;
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
