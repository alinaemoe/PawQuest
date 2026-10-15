import { expectFound, fromIso, toIso, type Ctx } from './ids';
import type { SqlDb, SqlRow, SqlValue } from './sql';

export type TrainingContext = 'home' | 'yard' | 'park' | 'street' | 'other';
export type AttemptResult = 'successful' | 'partial' | 'unsuccessful';

/** What a skill template varies from step to step (docs/05 §5.2). */
export type LevelAxis = 'distance' | 'duration' | 'distraction' | 'trigger' | 'custom';

export interface SkillTemplate {
  readonly key: string;
  readonly axis: LevelAxis;
  /** Meters, seconds or a distraction number, from easy to hard. */
  readonly values: readonly number[];
}

/** The built-in skill templates. Names and criteria are translated by the UI. */
export const SKILL_TEMPLATES: readonly SkillTemplate[] = [
  { key: 'recall', axis: 'distance', values: [2, 5, 10, 20] },
  { key: 'leash', axis: 'duration', values: [60, 180, 300, 600] },
  { key: 'impulse', axis: 'duration', values: [3, 10, 30, 60] },
  { key: 'eyes', axis: 'distraction', values: [1, 2, 3, 4] },
  { key: 'place', axis: 'duration', values: [10, 30, 60, 120] },
  { key: 'calm', axis: 'trigger', values: [20, 10, 5, 2] },
  { key: 'custom', axis: 'custom', values: [1] },
];

export interface SkillLevel {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly distanceM: number | null;
  readonly durationS: number | null;
  readonly distraction: number | null;
  readonly achievedAt: number | null;
}

export interface Skill {
  readonly id: string;
  readonly dogId: string;
  readonly name: string;
  readonly templateKey: string | null;
  readonly criterion: string | null;
  readonly currentLevelId: string | null;
  readonly levels: readonly SkillLevel[];
}

export interface SkillSummary extends Skill {
  readonly lastPracticedAt: number | null;
  readonly sessionsCount: number;
  readonly currentLevel: SkillLevel | null;
}

export interface LevelInput {
  readonly title: string;
  readonly distanceM?: number | null;
  readonly durationS?: number | null;
  readonly distraction?: number | null;
}

export interface SkillInput {
  readonly dogId: string;
  readonly name: string;
  readonly templateKey?: string | null;
  readonly description?: string | null;
  readonly criterion?: string | null;
  readonly levels: readonly LevelInput[];
  readonly isDemo?: boolean;
}

export interface TrainingSession {
  readonly id: string;
  readonly dogId: string;
  readonly skillId: string;
  readonly levelId: string | null;
  readonly walkId: string | null;
  readonly context: TrainingContext | null;
  readonly distraction: number | null;
  readonly reward: string | null;
  readonly startedAt: number;
  readonly tzOffsetMin: number;
  /** Null while the session is still running (a draft survives the app being closed, S11-9). */
  readonly durationS: number | null;
  readonly quality: number | null;
  readonly notes: string | null;
}

export interface SessionSettings {
  readonly levelId?: string | null;
  readonly walkId?: string | null;
  readonly context?: TrainingContext | null;
  readonly distraction?: number | null;
  readonly reward?: string | null;
  readonly tzOffsetMin?: number;
}

export interface Attempt {
  readonly id: string;
  readonly sessionId: string;
  readonly ts: number;
  readonly result: AttemptResult;
}

export interface AttemptCounts {
  readonly successful: number;
  readonly partial: number;
  readonly unsuccessful: number;
  readonly total: number;
  /** Success share with a partial attempt counted as half; null without attempts. */
  readonly share: number | null;
}

const str = (v: SqlValue | undefined): string | null => (typeof v === 'string' ? v : null);
const num = (v: SqlValue | undefined): number | null => (typeof v === 'number' ? v : null);

function toLevel(row: SqlRow): SkillLevel {
  const achieved = str(row['achieved_at']);
  return {
    id: String(row['id']),
    position: Number(row['position']),
    title: String(row['title']),
    distanceM: num(row['distance_m']),
    durationS: num(row['duration_s']),
    distraction: num(row['distraction']),
    achievedAt: achieved === null ? null : fromIso(achieved),
  };
}

function toSession(row: SqlRow): TrainingSession {
  return {
    id: String(row['id']),
    dogId: String(row['dog_id']),
    skillId: String(row['skill_id']),
    levelId: str(row['level_id']),
    walkId: str(row['walk_id']),
    context: str(row['context']) as TrainingContext | null,
    distraction: num(row['distraction']),
    reward: str(row['reward']),
    startedAt: fromIso(String(row['started_at'])),
    tzOffsetMin: Number(row['tz_offset_min']),
    durationS: num(row['duration_s']),
    quality: num(row['quality']),
    notes: str(row['notes']),
  };
}

function levelsOf(db: SqlDb, skillId: string): SkillLevel[] {
  return db
    .all('SELECT * FROM skill_level WHERE skill_id = ? ORDER BY position', [skillId])
    .map(toLevel);
}

function toSkill(db: SqlDb, row: SqlRow): Skill {
  const id = String(row['id']);
  return {
    id,
    dogId: String(row['dog_id']),
    name: String(row['name']),
    templateKey: str(row['template_key']),
    criterion: str(row['success_criterion']),
    currentLevelId: str(row['current_level_id']),
    levels: levelsOf(db, id),
  };
}

export function createSkill(db: SqlDb, ctx: Ctx, input: SkillInput): Skill {
  const name = input.name.trim();
  if (name === '') {
    throw new Error('A skill needs a name');
  }
  if (input.levels.length === 0) {
    throw new Error('A skill needs at least one level');
  }
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.transaction(() => {
    const levelIds = input.levels.map(() => ctx.newId());
    db.run(
      `INSERT INTO skill (id, dog_id, name, template_key, description, success_criterion, current_level_id, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.dogId,
        name,
        input.templateKey ?? null,
        input.description ?? null,
        input.criterion ?? null,
        levelIds[0] ?? null,
        input.isDemo === true ? 1 : 0,
        nowIso,
        nowIso,
      ],
    );
    input.levels.forEach((level, index) => {
      db.run(
        `INSERT INTO skill_level (id, skill_id, position, title, distance_m, duration_s, distraction)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          levelIds[index] ?? ctx.newId(),
          id,
          index + 1,
          level.title,
          level.distanceM ?? null,
          level.durationS ?? null,
          level.distraction ?? null,
        ],
      );
    });
  });
  return expectFound(getSkill(db, id), 'skill');
}

export function getSkill(db: SqlDb, id: string): Skill | null {
  const row = db.all('SELECT * FROM skill WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toSkill(db, row);
}

/** Skills of a dog, most recently practiced first (never practiced ones last, by name). */
export function listSkillSummaries(db: SqlDb, dogId: string): SkillSummary[] {
  const rows = db.all(
    `SELECT s.*,
            (SELECT MAX(t.started_at) FROM training_session t
               WHERE t.skill_id = s.id AND t.deleted_at IS NULL AND t.duration_s IS NOT NULL) AS last_at,
            (SELECT COUNT(*) FROM training_session t
               WHERE t.skill_id = s.id AND t.deleted_at IS NULL AND t.duration_s IS NOT NULL) AS sessions
       FROM skill s
      WHERE s.dog_id = ? AND s.deleted_at IS NULL AND s.archived = 0`,
    [dogId],
  );
  const summaries = rows.map((row): SkillSummary => {
    const skill = toSkill(db, row);
    const last = str(row['last_at']);
    return {
      ...skill,
      lastPracticedAt: last === null ? null : fromIso(last),
      sessionsCount: Number(row['sessions']),
      currentLevel: skill.levels.find((l) => l.id === skill.currentLevelId) ?? null,
    };
  });
  return summaries.sort((a, b) => {
    if (a.lastPracticedAt !== null && b.lastPracticedAt !== null) {
      return b.lastPracticedAt - a.lastPracticedAt;
    }
    if (a.lastPracticedAt !== null) {
      return -1;
    }
    if (b.lastPracticedAt !== null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/** Moves the skill to another level; the one left behind is marked achieved when moving up. */
export function setCurrentLevel(db: SqlDb, ctx: Ctx, skillId: string, levelId: string): void {
  const skill = expectFound(getSkill(db, skillId), 'skill');
  const target = skill.levels.find((l) => l.id === levelId);
  if (target === undefined) {
    throw new Error('That level belongs to another skill');
  }
  const current = skill.levels.find((l) => l.id === skill.currentLevelId);
  db.transaction(() => {
    if (
      current !== undefined &&
      target.position > current.position &&
      current.achievedAt === null
    ) {
      db.run('UPDATE skill_level SET achieved_at = ? WHERE id = ?', [toIso(ctx.now()), current.id]);
    }
    db.run('UPDATE skill SET current_level_id = ?, updated_at = ? WHERE id = ?', [
      levelId,
      toIso(ctx.now()),
      skillId,
    ]);
  });
}

export function startSession(
  db: SqlDb,
  ctx: Ctx,
  dogId: string,
  skillId: string,
  settings: SessionSettings = {},
): TrainingSession {
  const skill = expectFound(getSkill(db, skillId), 'skill');
  const id = ctx.newId();
  const nowIso = toIso(ctx.now());
  db.run(
    `INSERT INTO training_session
       (id, dog_id, skill_id, level_id, walk_id, started_at, tz_offset_min, context, distraction, reward, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      dogId,
      skillId,
      settings.levelId ?? skill.currentLevelId,
      settings.walkId ?? null,
      nowIso,
      settings.tzOffsetMin ?? 0,
      settings.context ?? null,
      settings.distraction ?? null,
      settings.reward ?? null,
      nowIso,
      nowIso,
    ],
  );
  return expectFound(getSession(db, id), 'session');
}

export function getSession(db: SqlDb, id: string): TrainingSession | null {
  const row = db.all('SELECT * FROM training_session WHERE id = ? AND deleted_at IS NULL', [id])[0];
  return row === undefined ? null : toSession(row);
}

/** The session that is still running, if any: it is restored when the app is opened again. */
export function getActiveSession(db: SqlDb, dogId: string): TrainingSession | null {
  const row = db.all(
    `SELECT * FROM training_session
      WHERE dog_id = ? AND duration_s IS NULL AND deleted_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [dogId],
  )[0];
  return row === undefined ? null : toSession(row);
}

export function addAttempt(db: SqlDb, ctx: Ctx, sessionId: string, result: AttemptResult): Attempt {
  const id = ctx.newId();
  const ts = ctx.now();
  db.run('INSERT INTO training_attempt (id, session_id, ts, result) VALUES (?, ?, ?, ?)', [
    id,
    sessionId,
    toIso(ts),
    result,
  ]);
  return { id, sessionId, ts, result };
}

/** Removes the newest attempt of a running session ("undo", S11-4). False when there is none. */
export function undoLastAttempt(db: SqlDb, sessionId: string): boolean {
  return (
    db.run(
      `DELETE FROM training_attempt WHERE id = (
         SELECT id FROM training_attempt WHERE session_id = ? ORDER BY ts DESC, id DESC LIMIT 1)`,
      [sessionId],
    ).changes > 0
  );
}

export function sessionCounts(db: SqlDb, sessionId: string): AttemptCounts {
  const counts: Record<AttemptResult, number> = { successful: 0, partial: 0, unsuccessful: 0 };
  for (const row of db.all(
    'SELECT result, COUNT(*) AS n FROM training_attempt WHERE session_id = ? GROUP BY result',
    [sessionId],
  )) {
    counts[String(row['result']) as AttemptResult] = Number(row['n']);
  }
  const total = counts.successful + counts.partial + counts.unsuccessful;
  return {
    ...counts,
    total,
    share: total === 0 ? null : (counts.successful + counts.partial / 2) / total,
  };
}

/** Rating 1..5 suggested from the success share (S11-7); the owner can change it. */
export function suggestedQuality(share: number | null): number | null {
  return share === null ? null : Math.round(share * 4) + 1;
}

export interface FinishInput {
  readonly quality?: number | null;
  readonly notes?: string | null;
}

/**
 * Ends a running session. A session without attempts is not kept (docs/05 §5.4a). The duration is
 * the clock time since the start. Returns whether anything was saved.
 */
export function finishSession(
  db: SqlDb,
  ctx: Ctx,
  sessionId: string,
  input: FinishInput = {},
): boolean {
  const session = expectFound(getSession(db, sessionId), 'session');
  if (sessionCounts(db, sessionId).total === 0) {
    db.run('DELETE FROM training_session WHERE id = ?', [sessionId]);
    return false;
  }
  db.run(
    'UPDATE training_session SET duration_s = ?, quality = ?, notes = ?, updated_at = ? WHERE id = ?',
    [
      Math.max(0, Math.round((ctx.now() - session.startedAt) / 1000)),
      input.quality ?? null,
      input.notes ?? null,
      toIso(ctx.now()),
      sessionId,
    ],
  );
  return true;
}

/** Throws a running session away with its attempts. */
export function discardSession(db: SqlDb, sessionId: string): void {
  db.run('DELETE FROM training_session WHERE id = ?', [sessionId]);
}

/**
 * The previous finished session of a skill in the same context, for "last time 3 of 6" (S11-7).
 * When the context was not set, any earlier session counts.
 */
export function previousComparable(
  db: SqlDb,
  skillId: string,
  context: TrainingContext | null,
  beforeTs: number,
  excludeSessionId: string,
): { readonly startedAt: number; readonly counts: AttemptCounts } | null {
  const row = db.all(
    `SELECT id, started_at FROM training_session
      WHERE skill_id = ? AND id <> ? AND deleted_at IS NULL AND duration_s IS NOT NULL
        AND started_at < ? AND (? IS NULL OR context = ?)
      ORDER BY started_at DESC LIMIT 1`,
    [skillId, excludeSessionId, toIso(beforeTs), context, context],
  )[0];
  if (row === undefined) {
    return null;
  }
  return {
    startedAt: fromIso(String(row['started_at'])),
    counts: sessionCounts(db, String(row['id'])),
  };
}

/** The settings of the latest finished session of a skill: "repeat as last time" (S11-P). */
export function lastSessionSettings(
  db: SqlDb,
  skillId: string,
): {
  readonly levelId: string | null;
  readonly context: TrainingContext | null;
  readonly distraction: number | null;
  readonly reward: string | null;
} | null {
  const row = db.all(
    `SELECT level_id, context, distraction, reward FROM training_session
      WHERE skill_id = ? AND deleted_at IS NULL AND duration_s IS NOT NULL
      ORDER BY started_at DESC LIMIT 1`,
    [skillId],
  )[0];
  if (row === undefined) {
    return null;
  }
  return {
    levelId: str(row['level_id']),
    context: str(row['context']) as TrainingContext | null,
    distraction: num(row['distraction']),
    reward: str(row['reward']),
  };
}

export interface LevelAttemptRow {
  readonly ts: number;
  readonly tzOffsetMin: number;
  readonly result: AttemptResult;
  readonly context: string;
}

/**
 * Attempts made on one level of a skill, for the "ready for the next step" hint (A-11). A session
 * that is still running counts too, so the hint can be shown before the session is saved.
 */
export function levelAttempts(db: SqlDb, skillId: string, levelId: string): LevelAttemptRow[] {
  return db
    .all(
      `SELECT a.ts, a.result, t.tz_offset_min, COALESCE(t.context, 'other') AS context
         FROM training_attempt a JOIN training_session t ON t.id = a.session_id
        WHERE t.skill_id = ? AND t.level_id = ? AND t.deleted_at IS NULL
        ORDER BY a.ts`,
      [skillId, levelId],
    )
    .map((row) => ({
      ts: fromIso(String(row['ts'])),
      tzOffsetMin: Number(row['tz_offset_min']),
      result: String(row['result']) as AttemptResult,
      context: String(row['context']),
    }));
}

/** Start moments of finished sessions of a skill, for "not practiced for a while" (A-10). */
export function sessionMoments(
  db: SqlDb,
  skillId: string,
): { readonly ts: number; readonly tzOffsetMin: number }[] {
  return db
    .all(
      `SELECT started_at, tz_offset_min FROM training_session
        WHERE skill_id = ? AND deleted_at IS NULL AND duration_s IS NOT NULL ORDER BY started_at`,
      [skillId],
    )
    .map((row) => ({
      ts: fromIso(String(row['started_at'])),
      tzOffsetMin: Number(row['tz_offset_min']),
    }));
}
