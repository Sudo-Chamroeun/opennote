export interface HistorySnapshot {
  title: string;
  content: string;
  cursorStart: number;
  cursorEnd: number;
  timestamp: number;
}

export interface NoteHistoryStack {
  past: HistorySnapshot[];
  present: HistorySnapshot;
  future: HistorySnapshot[];
}

const MAX_HISTORY_ENTRIES = 120;
const COALESCE_WINDOW_MS = 650;

export function createHistoryStack(initial: HistorySnapshot): NoteHistoryStack {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

export function pushHistorySnapshot(
  stack: NoteHistoryStack,
  next: HistorySnapshot,
  forceDiscrete = false,
): NoteHistoryStack {
  if (
    next.content === stack.present.content &&
    next.title === stack.present.title
  ) {
    return {
      ...stack,
      present: { ...stack.present, cursorStart: next.cursorStart, cursorEnd: next.cursorEnd },
    };
  }

  const lenDelta = Math.abs(next.content.length - stack.present.content.length);
  const withinCoalesceWindow =
    !forceDiscrete &&
    next.title === stack.present.title &&
    next.timestamp - stack.present.timestamp < COALESCE_WINDOW_MS &&
    lenDelta <= 2 &&
    stack.past.length > 0;

  if (withinCoalesceWindow) {
    return {
      past: stack.past,
      present: next,
      future: [],
    };
  }

  const nextPast = [...stack.past, stack.present].slice(-MAX_HISTORY_ENTRIES);
  return {
    past: nextPast,
    present: next,
    future: [],
  };
}

export function undoHistory(stack: NoteHistoryStack): {
  stack: NoteHistoryStack;
  restored: HistorySnapshot | null;
} {
  if (stack.past.length === 0) {
    return { stack, restored: null };
  }
  const previous = stack.past[stack.past.length - 1];
  const nextPast = stack.past.slice(0, -1);
  return {
    stack: {
      past: nextPast,
      present: previous,
      future: [stack.present, ...stack.future].slice(0, MAX_HISTORY_ENTRIES),
    },
    restored: previous,
  };
}

export function redoHistory(stack: NoteHistoryStack): {
  stack: NoteHistoryStack;
  restored: HistorySnapshot | null;
} {
  if (stack.future.length === 0) {
    return { stack, restored: null };
  }
  const next = stack.future[0];
  const nextFuture = stack.future.slice(1);
  return {
    stack: {
      past: [...stack.past, stack.present].slice(-MAX_HISTORY_ENTRIES),
      present: next,
      future: nextFuture,
    },
    restored: next,
  };
}
