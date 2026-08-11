import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Pill,
  ProgressBar,
  Screen,
  Title,
} from './ui';
import { bandColor, bandLabel, colors, font, radius, spacing } from './theme';
import {
  api,
  type Degree,
  type DiagnosticResults,
  type PublicQuestion,
  type SkillProfileItem,
  type TargetEstimate,
  type AdminSummary,
  type AdminQuestion,
  type ReviewHistoryItem,
} from './api';

export type SkillNames = Record<string, string>;

export function labelFor(names: SkillNames, id: string): string {
  return names[id] ?? id.split('.').slice(-1)[0].replace(/_/g, ' ');
}

// --- Sign in --------------------------------------------------------------
// Students are anonymous-first (spec §20/§23): "Start" needs no account.
// Google sign-in is optional; dev logins are shown only in development builds.
export function SignIn({
  onStartAnonymous,
  onDevStudent,
  onDevAdmin,
  onGoogle,
  googleEnabled,
  busy,
}: {
  onStartAnonymous: () => void;
  onDevStudent: () => void;
  onDevAdmin: () => void;
  onGoogle: () => void;
  googleEnabled: boolean;
  busy: boolean;
}) {
  // __DEV__ is true in Expo dev builds and false in production bundles.
  const showDev = typeof __DEV__ === 'undefined' ? true : __DEV__;
  return (
    <Screen>
      <View style={{ height: spacing.xl }} />
      <Title>Where do you want to go?</Title>
      <Body muted>
        PAU OS helps you figure out what to study next to reach the degree you want — starting with
        Matemàtiques II.
      </Body>
      <View style={{ height: spacing.md }} />
      <Button label={busy ? 'Starting…' : 'Start — no account needed'} onPress={onStartAnonymous} disabled={busy} />
      {googleEnabled ? (
        <Button label="Continue with Google" variant="secondary" onPress={onGoogle} disabled={busy} />
      ) : null}
      {showDev ? (
        <Card>
          <Body muted>Developer sign-in (local testing only)</Body>
          <Button label="Dev login as student" variant="secondary" onPress={onDevStudent} disabled={busy} />
          <Button label="Dev login as admin" variant="secondary" onPress={onDevAdmin} disabled={busy} />
        </Card>
      ) : null}
      <Body muted>Your progress is anonymous unless you choose to sign in.</Body>
    </Screen>
  );
}

// --- Screen 2: Goal -------------------------------------------------------
export function Goal({
  degrees,
  onChoose,
  busy,
}: {
  degrees: Degree[];
  onChoose: (degreeId: string, targetScore?: number) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<number | undefined>(undefined);

  return (
    <Screen>
      <Title>What do you want to study?</Title>
      <Body muted>Pick a target degree. You can change it later.</Body>
      {degrees.map((d) => {
        const active = selected === d.id;
        return (
          <Pressable key={d.id} onPress={() => setSelected(d.id)}>
            <View style={[styles.option, active && styles.optionActive]}>
              <Text style={styles.optionTitle}>{d.name.ca}</Text>
              <Text style={styles.optionMeta}>{d.university}</Text>
            </View>
          </Pressable>
        );
      })}

      <Heading>Target score (optional)</Heading>
      <View style={styles.row}>
        {[undefined, 11, 12, 13].map((t) => {
          const active = target === t;
          return (
            <Pressable key={String(t)} onPress={() => setTarget(t)}>
              <View style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t === undefined ? 'Skip' : `${t} / 14`}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={busy ? 'Saving…' : 'Continue'}
        onPress={() => selected && onChoose(selected, target)}
        disabled={!selected || busy}
      />
    </Screen>
  );
}

// --- Screen 3: Diagnostic intro ------------------------------------------
export function DiagnosticIntro({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <Screen>
      <Title>Let’s see where you stand</Title>
      <Card>
        <Body>
          This is not a test you can fail. We are measuring what you already know so we can tell you
          what to work on next.
        </Body>
        <Body muted>About 15–20 minutes. One question at a time.</Body>
      </Card>
      <Button label={busy ? 'Preparing…' : 'Begin diagnostic'} onPress={onStart} disabled={busy} />
    </Screen>
  );
}

// --- Screen 4: Diagnostic question ---------------------------------------
export function DiagnosticQuestion({
  question,
  asked,
  onAnswer,
  busy,
}: {
  question: PublicQuestion;
  asked: number;
  onAnswer: (optionId?: string, idk?: boolean) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  // Reset selection when the question changes.
  useEffect(() => setSelected(null), [question.id]);

  return (
    <Screen>
      <Body muted>Question {asked + 1}</Body>
      <ProgressBar value={Math.min(1, (asked + 1) / 20)} />
      <Heading>{question.question.ca}</Heading>
      {question.options.map((o) => {
        const active = selected === o.id;
        return (
          <Pressable key={o.id} onPress={() => setSelected(o.id)} disabled={busy}>
            <View style={[styles.option, active && styles.optionActive]}>
              <Text style={styles.optionTitle}>{o.ca}</Text>
            </View>
          </Pressable>
        );
      })}
      <Button
        label={busy ? '…' : 'Continue'}
        onPress={() => selected && onAnswer(selected, false)}
        disabled={!selected || busy}
      />
      <Button label="I don’t know" variant="secondary" onPress={() => onAnswer(undefined, true)} disabled={busy} />
    </Screen>
  );
}

// --- Screen 5: Results ----------------------------------------------------
export function Results({
  results,
  targetScore,
  names,
  onStartSession,
  onHome,
}: {
  results: DiagnosticResults;
  targetScore?: number;
  names: SkillNames;
  onStartSession: () => void;
  onHome: () => void;
}) {
  const { level, gaps, strengths, recommendation } = results;
  return (
    <Screen>
      <Title>Your starting point</Title>
      <Card>
        <Body muted>Estimated current level</Body>
        <Text style={styles.big}>
          {level.range[0]} – {level.range[1]} <Text style={styles.bigUnit}>/ 10</Text>
        </Text>
        <Body muted>
          {targetScore ? `Target: ${targetScore} / 14. ` : ''}This is an estimate; it sharpens as you
          practise.
        </Body>
      </Card>

      {recommendation ? (
        <Card>
          <Body muted>Recommended next action</Body>
          <Heading>Focus on {labelFor(names, recommendation.skillId)}</Heading>
          <Body>{recommendation.explanation}</Body>
        </Card>
      ) : null}

      {gaps.length > 0 ? (
        <Card>
          <Body muted>Main gaps</Body>
          {gaps.map((g) => (
            <View key={g.skillId} style={styles.rowBetween}>
              <Text style={styles.body}>{labelFor(names, g.skillId)}</Text>
              <Pill text={bandLabel(g.band)} color={bandColor(g.band)} />
            </View>
          ))}
        </Card>
      ) : null}

      {strengths.length > 0 ? (
        <Card>
          <Body muted>Strengths</Body>
          {strengths.map((s) => (
            <View key={s.skillId} style={styles.rowBetween}>
              <Text style={styles.body}>{labelFor(names, s.skillId)}</Text>
              <Pill text={bandLabel(s.band)} color={bandColor(s.band)} />
            </View>
          ))}
        </Card>
      ) : null}

      <Button label="Start 15 min session" onPress={onStartSession} />
      <Button label="Go to home" variant="secondary" onPress={onHome} />
    </Screen>
  );
}

// --- Screen 6: Home -------------------------------------------------------
export function Home({
  degreeName,
  level,
  targetScore,
  recommendation,
  target,
  names,
  onTrain,
  onProgress,
}: {
  degreeName: string;
  level?: DiagnosticResults['level'];
  targetScore?: number;
  recommendation?: { skillId: string; explanation: string } | null;
  target?: TargetEstimate | null;
  names: SkillNames;
  onTrain: () => void;
  onProgress: () => void;
}) {
  return (
    <Screen>
      <Body muted>Your goal</Body>
      <Title>{degreeName}</Title>

      <Card>
        <Body muted>What should I do now?</Body>
        {recommendation ? (
          <>
            <Heading>Train {labelFor(names, recommendation.skillId)}</Heading>
            <Body>{recommendation.explanation}</Body>
          </>
        ) : (
          <Body>Start a practice session to build evidence on your weak skills.</Body>
        )}
      </Card>

      {level ? (
        <Card>
          <Body muted>Estimated Matemàtiques II level</Body>
          <Text style={styles.big}>
            {level.range[0]} – {level.range[1]} <Text style={styles.bigUnit}>/ 10</Text>
          </Text>
          {targetScore ? <Body muted>Your target: {targetScore} / 14</Body> : null}
        </Card>
      ) : null}

      {target && 'degreeName' in target && target.contribution ? (
        <Card>
          <Body muted>Toward your target</Body>
          <Body>
            For {target.degreeName}, Matemàtiques II is weighted ×{target.contribution.coefficient}.
            Your level contributes about {target.contribution.range[0]}–{target.contribution.range[1]}{' '}
            of the specific-phase points.
          </Body>
          {target.cutoff ? (
            <Body muted>
              Recent cut-off ≈ {target.cutoff.score}/14 ({target.cutoff.sourceType}). This is not a
              required score.
            </Body>
          ) : null}
          <Body muted>{target.disclaimer}</Body>
        </Card>
      ) : null}

      <Button label="Train now" onPress={onTrain} />
      <Button label="See my progress" variant="secondary" onPress={onProgress} />
    </Screen>
  );
}

// --- Screen 8: Progress ---------------------------------------------------
export function Progress({
  skills,
  names,
  onHome,
}: {
  skills: SkillProfileItem[];
  names: SkillNames;
  onHome: () => void;
}) {
  const order = { weak: 0, developing: 1, insufficient_evidence: 2, mastered: 3 } as const;
  const sorted = [...skills].sort((a, b) => order[a.band] - order[b.band]);
  return (
    <Screen>
      <Title>Your skill map</Title>
      <Body muted>Confidence grows as you answer more questions.</Body>
      {sorted.length === 0 ? <Body>No skills assessed yet.</Body> : null}
      {sorted.map((s) => (
        <Card key={s.skillId}>
          <View style={styles.rowBetween}>
            <Text style={styles.body}>{labelFor(names, s.skillId)}</Text>
            <Pill text={bandLabel(s.band)} color={bandColor(s.band)} />
          </View>
          <ProgressBar value={s.confidence} />
        </Card>
      ))}
      <Button label="Back to home" variant="secondary" onPress={onHome} />
    </Screen>
  );
}

// --- Screen 7: Practice (adaptive composed session) -----------------------
export function Practice({
  studentId,
  names,
  onDone,
}: {
  studentId: string;
  names: SkillNames;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await api.startSession(studentId);
      if (cancelled) return;
      setSessionId(session.sessionId);
      setQuestions(session.questions);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const question = questions[index];

  async function submit(optionId?: string, idk?: boolean) {
    if (!question || !sessionId) return;
    const res = await api.submitSessionResponse(sessionId, question.id, optionId, idk);
    setFeedback({ correct: res.correct, explanation: res.explanation.ca });
  }

  async function next() {
    setFeedback(null);
    setSelected(null);
    if (index + 1 >= questions.length) {
      if (sessionId) await api.completeSession(sessionId).catch(() => undefined);
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (loading) return <Screen><Loading label="Building your session…" /></Screen>;
  if (finished || !question) {
    return (
      <Screen>
        <Title>Session complete</Title>
        <Body muted>Nice work — your progress has been updated.</Body>
        <Button label="Back to home" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body muted>
        Session · {index + 1} of {questions.length} ·{' '}
        {question.skills[0] ? labelFor(names, question.skills[0]) : ''}
      </Body>
      <ProgressBar value={(index + (feedback ? 1 : 0)) / Math.max(1, questions.length)} />
      <Heading>{question.question.ca}</Heading>
      {question.options.map((o) => {
        const active = selected === o.id;
        return (
          <Pressable key={o.id} onPress={() => !feedback && setSelected(o.id)} disabled={!!feedback}>
            <View style={[styles.option, active && styles.optionActive]}>
              <Text style={styles.optionTitle}>{o.ca}</Text>
            </View>
          </Pressable>
        );
      })}

      {feedback ? (
        <Card>
          <Pill
            text={feedback.correct ? 'Correct' : 'Not quite'}
            color={feedback.correct ? colors.success : colors.danger}
          />
          <Body>{feedback.explanation}</Body>
        </Card>
      ) : null}

      {!feedback ? (
        <>
          <Button label="Check" onPress={() => selected && submit(selected, false)} disabled={!selected} />
          <Button label="I don’t know" variant="secondary" onPress={() => submit(undefined, true)} />
        </>
      ) : (
        <Button label={index + 1 >= questions.length ? 'Finish session' : 'Next question'} onPress={() => void next()} />
      )}
    </Screen>
  );
}

// --- Admin dashboard (role-gated) -----------------------------------------
export function AdminDashboard({
  onSignOut,
  onOpenReview,
}: {
  onSignOut: () => void;
  onOpenReview: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .adminSummary()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'error'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Screen><Loading label="Loading pilot metrics…" /></Screen>;

  return (
    <Screen>
      <Body muted>Admin</Body>
      <Title>Pilot metrics</Title>
      {error ? <Body>{error}</Body> : null}
      {data ? (
        <>
          <Card>
            <Body muted>Cohort</Body>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Students</Text>
              <Text style={styles.body}>{data.summary.students}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Diagnostics completed</Text>
              <Text style={styles.body}>
                {data.summary.diagnosticCompleted} / {data.summary.diagnosticStarted}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Completion rate</Text>
              <Text style={styles.body}>{Math.round(data.summary.diagnosticCompletionRate * 100)}%</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Avg study minutes</Text>
              <Text style={styles.body}>{data.summary.avgStudyMinutes}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.body}>Avg learning gain / hour</Text>
              <Text style={styles.body}>{data.summary.avgLearningGainPerHour ?? '—'}</Text>
            </View>
          </Card>
          <Card>
            <Body muted>Events recorded</Body>
            {Object.entries(data.eventCounts)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([name, count]) => (
                <View key={name} style={styles.rowBetween}>
                  <Text style={styles.body}>{name}</Text>
                  <Text style={styles.body}>{count}</Text>
                </View>
              ))}
          </Card>
        </>
      ) : null}
      <Button label="Review content" onPress={onOpenReview} />
      <Button label="Sign out" variant="secondary" onPress={onSignOut} />
    </Screen>
  );
}

// --- Admin content review (role-gated) ------------------------------------
const reviewStatusColor = (status: string): string =>
  status === 'approved' || status === 'published'
    ? colors.success
    : status === 'rejected'
      ? colors.danger
      : colors.warning;

export function ContentReview({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<AdminQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { reviews: rs } = await api.adminReviews();
      setReviews(rs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadQueue().then(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadQueue]);

  const selected = reviews.find((r) => r.id === selectedId) ?? null;

  async function openDetail(id: string): Promise<void> {
    setSelectedId(id);
    setNotes('');
    setHistory([]);
    try {
      const { history: h } = await api.adminReview(id);
      setHistory(h);
    } catch {
      // History is best-effort; the queue item already holds the question.
    }
  }

  async function decide(action: 'approve' | 'reject'): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      if (action === 'approve') await api.approveReview(selected.id, notes || undefined);
      else await api.rejectReview(selected.id, notes || undefined);
      setSelectedId(null);
      await loadQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen><Loading label="Loading review queue…" /></Screen>;

  // Detail view for a selected question.
  if (selected) {
    const correct = selected.answer?.correct;
    return (
      <Screen>
        <Body muted>Review · {selected.id}</Body>
        <Title>Question</Title>
        {error ? <Body>{error}</Body> : null}
        <Card>
          <View style={styles.row}>
            <Pill text={selected.reviewStatus} color={reviewStatusColor(selected.reviewStatus)} />
            <Pill text={selected.source.type} color={colors.muted} />
          </View>
          <Text style={styles.body}>{selected.question.ca}</Text>
          {selected.options.map((o) => {
            const isCorrect = Array.isArray(correct) ? correct.includes(o.id) : correct === o.id;
            return (
              <View key={o.id} style={styles.rowBetween}>
                <Text style={styles.body}>
                  {o.id}. {o.ca}
                </Text>
                {isCorrect ? <Pill text="correct" color={colors.success} /> : null}
              </View>
            );
          })}
        </Card>
        <Card>
          <Body muted>Explanation</Body>
          <Text style={styles.body}>{selected.explanation.ca || '—'}</Text>
        </Card>
        {history.length ? (
          <Card>
            <Body muted>History</Body>
            {history.map((h) => (
              <View key={h.id} style={styles.rowBetween}>
                <Text style={styles.body}>{h.status}</Text>
                <Text style={styles.optionMeta}>{h.notes ?? ''}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <Button label="Approve" onPress={() => void decide('approve')} disabled={busy} />
        <Button
          label="Reject"
          variant="secondary"
          onPress={() => void decide('reject')}
          disabled={busy}
        />
        <Button label="Back to queue" variant="secondary" onPress={() => setSelectedId(null)} />
      </Screen>
    );
  }

  // Queue list.
  return (
    <Screen>
      <Body muted>Admin</Body>
      <Title>Review queue</Title>
      {error ? <Body>{error}</Body> : null}
      {reviews.length === 0 ? (
        <Card>
          <Body muted>Nothing awaiting review.</Body>
        </Card>
      ) : (
        reviews.map((r) => (
          <Pressable key={r.id} onPress={() => void openDetail(r.id)}>
            <Card>
              <View style={styles.row}>
                <Pill text={r.reviewStatus} color={reviewStatusColor(r.reviewStatus)} />
                <Pill text={r.source.type} color={colors.muted} />
              </View>
              <Text style={styles.body} numberOfLines={2}>
                {r.question.ca}
              </Text>
              <Text style={styles.optionMeta}>{r.skills.join(', ')}</Text>
            </Card>
          </Pressable>
        ))
      )}
      <Button label="Back" variant="secondary" onPress={onBack} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  optionActive: { borderColor: colors.primary, borderWidth: 2 },
  optionTitle: { fontSize: font.body, color: colors.text, fontWeight: '500' },
  optionMeta: { fontSize: font.small, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: '#EEF3FF' },
  chipText: { color: colors.text, fontWeight: '600', fontSize: font.small },
  chipTextActive: { color: colors.primary },
  body: { fontSize: font.body, color: colors.text, flexShrink: 1, paddingRight: spacing.sm },
  big: { fontSize: 40, fontWeight: '800', color: colors.text },
  bigUnit: { fontSize: font.heading, color: colors.muted, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
    minHeight: 44,
  },
});
