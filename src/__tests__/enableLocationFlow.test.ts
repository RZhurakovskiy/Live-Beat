import {
  DIALOG_TIMEOUT_MS,
  EnableLocationDeps,
  enableLocationFlow,
  QUICK_FAIL_MS,
} from '../location/enableLocationFlow';

/** Часы, которые двигаются только по команде теста. */
function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function setup(overrides: Partial<EnableLocationDeps> = {}) {
  const c = clock();
  const openSettings = jest.fn().mockResolvedValue(undefined);
  const deps: EnableLocationDeps = {
    requestDialog: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(true),
    openSettings,
    now: c.now,
    ...overrides,
  };
  return { c, deps, openSettings };
}

describe('enableLocationFlow', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns enabled when the user turns location on, without touching settings', async () => {
    const { deps, openSettings } = setup();
    await expect(enableLocationFlow(deps)).resolves.toBe('enabled');
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('opens settings if the dialog said yes but location is still off', async () => {
    const { deps, openSettings } = setup({ isEnabled: jest.fn().mockResolvedValue(false) });
    await expect(enableLocationFlow(deps)).resolves.toBe('settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('opens settings at once when the dialog fails instantly, which means there was no dialog', async () => {
    const c = clock();
    const { deps, openSettings } = setup({
      now: c.now,
      requestDialog: jest.fn().mockImplementation(async () => {
        c.advance(50);
        throw new Error('no google services');
      }),
    });
    await expect(enableLocationFlow(deps)).resolves.toBe('settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('does not nag with settings after the user saw the dialog and said no', async () => {
    const c = clock();
    const { deps, openSettings } = setup({
      now: c.now,
      requestDialog: jest.fn().mockImplementation(async () => {
        c.advance(QUICK_FAIL_MS + 800);
        throw new Error('declined');
      }),
    });
    await expect(enableLocationFlow(deps)).resolves.toBe('declined');
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('treats a failure right at the quick limit as a human answer', async () => {
    const c = clock();
    const { deps } = setup({
      now: c.now,
      requestDialog: jest.fn().mockImplementation(async () => {
        c.advance(QUICK_FAIL_MS);
        throw new Error('declined');
      }),
    });
    await expect(enableLocationFlow(deps)).resolves.toBe('declined');
  });

  it('gives up on a dialog that never answers and opens settings', async () => {
    const { deps, openSettings } = setup({ requestDialog: jest.fn().mockReturnValue(new Promise(() => {})) });
    const result = enableLocationFlow(deps);
    await jest.advanceTimersByTimeAsync(DIALOG_TIMEOUT_MS + 1);
    await expect(result).resolves.toBe('settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer that arrives after the timeout', async () => {
    let answer: () => void = () => {};
    const { deps, openSettings } = setup({
      requestDialog: jest.fn().mockReturnValue(new Promise<void>((resolve) => (answer = resolve))),
    });
    const result = enableLocationFlow(deps);
    await jest.advanceTimersByTimeAsync(DIALOG_TIMEOUT_MS + 1);
    await expect(result).resolves.toBe('settings');
    answer();
    await Promise.resolve();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('still reports settings when opening them fails too', async () => {
    const { deps } = setup({
      requestDialog: jest.fn().mockRejectedValue(new Error('no dialog')),
      openSettings: jest.fn().mockRejectedValue(new Error('no settings screen')),
    });
    await expect(enableLocationFlow(deps)).resolves.toBe('settings');
  });

  it('survives the dialog call throwing synchronously', async () => {
    const { deps, openSettings } = setup({
      requestDialog: jest.fn().mockImplementation(() => {
        throw new Error('native module missing');
      }),
    });
    await expect(enableLocationFlow(deps)).resolves.toBe('settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
