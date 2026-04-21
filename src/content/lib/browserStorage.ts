import { PROMPTS_STORAGE_KEY, type SavedPrompt } from "../../shared/promptTypes";

type StorageArea = {
  get: (
    key: string,
    callback?: (items: Record<string, unknown>) => void
  ) => Promise<Record<string, unknown>> | void;
  set: (
    items: Record<string, unknown>,
    callback?: () => void
  ) => Promise<void> | void;
};

type ExtensionApi = {
  storage?: {
    local?: StorageArea;
  };
};

const fallbackStorageKey = `enhance-chatgpt:${PROMPTS_STORAGE_KEY}`;

function extensionApi(): ExtensionApi | undefined {
  const scope = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };

  return scope.browser ?? scope.chrome;
}

async function storageGet(key: string): Promise<Record<string, unknown> | undefined> {
  const area = extensionApi()?.storage?.local;

  if (!area) {
    return undefined;
  }

  try {
    const maybePromise = area.get(key);
    if (maybePromise && typeof maybePromise.then === "function") {
      return await maybePromise;
    }
  } catch {
    return await new Promise((resolve) => {
      area.get(key, (items) => resolve(items));
    });
  }

  return await new Promise((resolve) => {
    area.get(key, (items) => resolve(items));
  });
}

async function storageSet(items: Record<string, unknown>): Promise<boolean> {
  const area = extensionApi()?.storage?.local;

  if (!area) {
    return false;
  }

  try {
    const maybePromise = area.set(items);
    if (maybePromise && typeof maybePromise.then === "function") {
      await maybePromise;
    }
    return true;
  } catch {
    await new Promise<void>((resolve) => {
      area.set(items, () => resolve());
    });
    return true;
  }
}

function isPromptList(value: unknown): value is SavedPrompt[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const prompt = item as Partial<SavedPrompt>;
    return (
      typeof prompt.id === "string" &&
      typeof prompt.title === "string" &&
      typeof prompt.body === "string" &&
      typeof prompt.createdAt === "string"
    );
  });
}

export async function loadPrompts(): Promise<SavedPrompt[]> {
  const extensionItems = await storageGet(PROMPTS_STORAGE_KEY);
  const extensionPrompts = extensionItems?.[PROMPTS_STORAGE_KEY];

  if (isPromptList(extensionPrompts)) {
    return extensionPrompts;
  }

  const raw = globalThis.localStorage?.getItem(fallbackStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPromptList(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePrompts(prompts: SavedPrompt[]): Promise<void> {
  const savedToExtension = await storageSet({ [PROMPTS_STORAGE_KEY]: prompts });

  if (!savedToExtension) {
    globalThis.localStorage?.setItem(fallbackStorageKey, JSON.stringify(prompts));
  }
}
