type KeyAction = {
  setImage(value: string): Promise<void>;
  setTitle(value: string): Promise<void>;
};

type DialAction = {
  setFeedback(value: unknown): Promise<void>;
};

type RenderState = {
  image?: string;
  title?: string;
  feedback?: string;
  tail?: Promise<void>;
  keyPending?: { payload: string; promise: Promise<void> };
  feedbackPending?: { payload: string; promise: Promise<void> };
};

const renders = new WeakMap<object, RenderState>();

function stateFor(action: object): RenderState {
  const existing = renders.get(action);
  if (existing) return existing;
  const state: RenderState = {};
  renders.set(action, state);
  return state;
}

function serialize(
  state: RenderState,
  work: () => Promise<void>,
): Promise<void> {
  const task = (state.tail ?? Promise.resolve()).then(work);
  state.tail = task.catch(() => undefined);
  return task;
}

/** Send a key render only when its image or title transport payload changed. */
export async function renderKey(
  action: KeyAction,
  image: string,
): Promise<void> {
  const state = stateFor(action);
  if (state.keyPending?.payload === image) {
    return state.keyPending.promise;
  }
  const task = serialize(state, async () => {
    if (state.image !== image) {
      await action.setImage(image);
      state.image = image;
    }
    if (state.title !== "") {
      await action.setTitle("");
      state.title = "";
    }
  });
  state.keyPending = { payload: image, promise: task };
  void task
    .finally(() => {
      if (state.keyPending?.promise === task) delete state.keyPending;
    })
    .catch(() => undefined);
  return task;
}

/** Send dial feedback only when its serialized SDK payload changed. */
export async function renderFeedback(
  action: DialAction,
  feedback: unknown,
): Promise<void> {
  const serialized = JSON.stringify(feedback);
  const state = stateFor(action);
  if (state.feedbackPending?.payload === serialized) {
    return state.feedbackPending.promise;
  }
  const task = serialize(state, async () => {
    if (state.feedback === serialized) return;
    await action.setFeedback(feedback);
    state.feedback = serialized;
  });
  state.feedbackPending = { payload: serialized, promise: task };
  void task
    .finally(() => {
      if (state.feedbackPending?.promise === task) delete state.feedbackPending;
    })
    .catch(() => undefined);
  return task;
}
