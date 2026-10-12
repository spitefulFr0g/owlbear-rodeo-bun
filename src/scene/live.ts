import {
  LiveKind,
  LiveMessage,
  LiveState,
  ReceivedLiveMessage,
  Vector2,
} from "../sceneRules";

/** The interface sends each kind at most once in this many milliseconds (20fps) */
export const liveSendInterval = 50;

export const liveKinds: LiveKind[] = ["pointer", "ruler", "drag"];

/**
 * One live mark as received: the state it was drawn in when its latest update
 * arrived, and that update, which it reaches one send interval later
 */
export type LiveMark<K extends LiveKind = LiveKind> = {
  from: LiveState[K];
  to: LiveState[K];
  fromTime: number;
  toTime: number;
};

/** The live marks received for the scene being viewed, by kind then connection */
export type LiveMarks = { [K in LiveKind]: Record<string, LiveMark<K>> };

export const noLiveMarks: LiveMarks = { pointer: {}, ruler: {}, drag: {} };

function lerp(from: number, to: number, alpha: number) {
  return from + (to - from) * alpha;
}

function lerpPoint(from: Vector2, to: Vector2, alpha: number): Vector2 {
  return { x: lerp(from.x, to.x, alpha), y: lerp(from.y, to.y, alpha) };
}

type Smooth<K extends LiveKind> = (
  from: LiveState[K],
  to: LiveState[K],
  alpha: number
) => LiveState[K];

const smooth: { [K in LiveKind]: Smooth<K> } = {
  // A pointer that hides finishes its move first, one that shows starts in place
  pointer: (from, to, alpha) => ({
    position: lerpPoint(from.position, to.position, alpha),
    visible: alpha < 1 ? from.visible : to.visible,
  }),
  ruler: (from, to, alpha) => ({
    start: lerpPoint(from.start, to.start, alpha),
    end: lerpPoint(from.end, to.end, alpha),
  }),
  // The latest update decides which items are held and their order
  drag: (from, to, alpha) => ({
    items: to.items.map((item) => {
      const before = from.items.find((held) => held.id === item.id);
      if (!before) return item;
      return {
        id: item.id,
        position: lerpPoint(before.position, item.position, alpha),
        rotation: lerp(before.rotation, item.rotation, alpha),
        scale: lerpPoint(before.scale, item.scale, alpha),
      };
    }),
  }),
};

/** A mark as drawn at a time, smoothed between its last two updates */
export function liveStateAt<K extends LiveKind>(
  kind: K,
  mark: LiveMark<K>,
  now: number
): LiveState[K] {
  const length = mark.toTime - mark.fromTime;
  const alpha =
    length > 0 ? Math.min(Math.max((now - mark.fromTime) / length, 0), 1) : 1;
  // The frontend's TypeScript cannot follow the kind through the table
  return (smooth[kind] as unknown as Smooth<K>)(mark.from, mark.to, alpha);
}

/** Every mark of one kind as drawn at a time, by connection */
export function liveStatesAt<K extends LiveKind>(
  kind: K,
  marks: LiveMarks,
  now: number
): Record<string, LiveState[K]> {
  const states: Record<string, LiveState[K]> = {};
  for (const [connectionId, mark] of Object.entries(marks[kind])) {
    states[connectionId] = liveStateAt(kind, mark as LiveMark<K>, now);
  }
  return states;
}

/** Whether any mark of a kind is still moving towards its latest update */
export function liveMoving(kind: LiveKind, marks: LiveMarks, now: number) {
  return Object.values(marks[kind]).some((mark) => now < mark.toTime);
}

/**
 * The marks after a live message: an update replaces its connection's mark of
 * that kind whole, starting from where the mark was drawn, and an end removes it
 */
export function afterLive(
  marks: LiveMarks,
  message: ReceivedLiveMessage,
  now: number
): LiveMarks {
  const { kind, connectionId } = message;
  const { [connectionId]: previous, ...others } = marks[kind] as Record<
    string,
    LiveMark
  >;
  if (message.state === null) {
    return previous ? { ...marks, [kind]: others } : marks;
  }
  const mark: LiveMark = {
    from: previous ? liveStateAt(kind, previous, now) : message.state,
    to: message.state,
    fromTime: now,
    toTime: now + liveSendInterval,
  };
  return { ...marks, [kind]: { ...others, [connectionId]: mark } };
}

/** The marks once a connection has left the room */
export function withoutConnection(
  marks: LiveMarks,
  connectionId: string
): LiveMarks {
  if (!liveKinds.some((kind) => connectionId in marks[kind])) return marks;
  const next = { ...marks };
  for (const kind of liveKinds) {
    const { [connectionId]: _, ...others } = marks[kind] as Record<
      string,
      LiveMark
    >;
    (next[kind] as Record<string, LiveMark>) = others;
  }
  return next;
}

/** What this connection has out on a scene for one kind */
type Sending = {
  sceneId: string;
  sentAt: number;
  // The latest update the throttle is holding back
  held: LiveState[LiveKind] | null;
};

export type LiveSender = {
  /**
   * Takes this connection's latest state of one kind. It is sent at once
   * unless an update of that kind went out within the send interval, when it
   * waits for `flush` and replaces any update already waiting.
   */
  update: <K extends LiveKind>(
    sceneId: string,
    kind: K,
    state: LiveState[K],
    now: number
  ) => void;
  /** Sends the updates whose wait is over */
  flush: (now: number) => void;
  /** Whether an update is waiting for `flush` */
  waiting: () => boolean;
  /** Ends one kind, dropping any update waiting. Nothing is sent for a kind not out */
  end: (kind: LiveKind) => void;
  /** Ends every kind that is out */
  endAll: () => void;
  /** Forgets everything without sending, as the server has ended it already */
  reset: () => void;
};

/**
 * The one sender of this connection's live messages. `send` is given each
 * message with whether it must not be dropped, which is so for an end only.
 */
export function createLiveSender(
  send: (message: LiveMessage, reliable: boolean) => void
): LiveSender {
  let sending: Partial<Record<LiveKind, Sending>> = {};

  function sendUpdate(kind: LiveKind, out: Sending, now: number) {
    const state = out.held;
    out.held = null;
    out.sentAt = now;
    send({ sceneId: out.sceneId, kind, state } as LiveMessage, false);
  }

  function end(kind: LiveKind) {
    const out = sending[kind];
    if (!out) return;
    delete sending[kind];
    send({ sceneId: out.sceneId, kind, state: null }, true);
  }

  return {
    update(sceneId, kind, state, now) {
      // A mark never follows its sender from one scene to the next
      if (sending[kind] && sending[kind]!.sceneId !== sceneId) end(kind);
      const out = sending[kind];
      if (!out) {
        const started = { sceneId, sentAt: now, held: state };
        sending[kind] = started;
        sendUpdate(kind, started, now);
        return;
      }
      out.held = state;
      if (now - out.sentAt >= liveSendInterval) sendUpdate(kind, out, now);
    },
    flush(now) {
      for (const kind of liveKinds) {
        const out = sending[kind];
        if (out?.held && now - out.sentAt >= liveSendInterval) {
          sendUpdate(kind, out, now);
        }
      }
    },
    waiting: () => liveKinds.some((kind) => !!sending[kind]?.held),
    end,
    endAll() {
      for (const kind of liveKinds) end(kind);
    },
    reset() {
      sending = {};
    },
  };
}
