import {
  createEvent,
  saveEventDetail,
  updateEvent,
  type BehaviorEvent,
  type Ctx,
  type EventDetail,
  type SqlDb,
} from '@pawquest/data';
import type { ObservationDraft } from '@pawquest/screens';

export const EMPTY_DRAFT: ObservationDraft = {
  typeId: 'dog',
  distanceBucket: null,
  reaction: null,
  distraction: null,
  behaviors: [],
  ownerActions: [],
  outcome: null,
  recoveryText: '',
  antecedent: '',
  note: '',
  thought: '',
  agoMs: 0,
};

/** The form's starting values for an event that already exists; its time is kept. */
export function draftOfEvent(event: BehaviorEvent, detail: EventDetail): ObservationDraft {
  return {
    typeId: event.typeId,
    distanceBucket: event.distanceBucket,
    reaction: event.reaction,
    distraction: event.distraction,
    behaviors: detail.behaviors,
    ownerActions: detail.ownerActions,
    outcome: detail.outcome,
    recoveryText: event.recoveryS === null ? '' : String(event.recoveryS),
    antecedent: detail.antecedent ?? '',
    note: event.note ?? '',
    thought: detail.interpretation ?? '',
    agoMs: -1, // keep the original time unless another one is chosen
  };
}

const trimmed = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/**
 * Writes the form: a new event (at "now" minus `agoMs`) or the changes to an existing one, with
 * its ABC details. Returns the id of the event.
 */
export function saveObservation(
  db: SqlDb,
  ctx: Ctx,
  args: {
    readonly dogId: string;
    /** The event to change, or null for a new one. */
    readonly eventId: string | null;
    readonly draft: ObservationDraft;
    readonly walkId?: string | null;
  },
): string {
  const { draft } = args;
  const common = {
    typeId: draft.typeId,
    note: trimmed(draft.note),
    distanceBucket: draft.distanceBucket,
    reaction: draft.reaction,
    distraction: draft.distraction,
    recoveryS: /^\d{1,4}$/.test(draft.recoveryText) ? Number(draft.recoveryText) : null,
    incomplete: false,
  };
  let id: string;
  if (args.eventId === null) {
    id = createEvent(db, ctx, {
      dogId: args.dogId,
      ...common,
      ...(args.walkId === undefined ? {} : { walkId: args.walkId }),
      ts: ctx.now() - Math.max(0, draft.agoMs),
      tzOffsetMin: -new Date().getTimezoneOffset(),
    }).id;
  } else {
    id = args.eventId;
    updateEvent(db, ctx, id, {
      ...common,
      ...(draft.agoMs >= 0 ? { ts: ctx.now() - draft.agoMs } : {}),
    });
  }
  saveEventDetail(db, ctx, id, {
    antecedent: trimmed(draft.antecedent),
    behaviors: draft.behaviors,
    ownerActions: draft.ownerActions,
    outcome: draft.outcome,
    consequenceNote: null,
    interpretation: trimmed(draft.thought),
  });
  return id;
}
