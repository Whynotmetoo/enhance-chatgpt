const pageContextScript = "page-context.js";
const requestSource = "enhance-chatgpt:fetch-conversation";
const responseSource = "enhance-chatgpt:fetch-conversation-response";
const conversationActivitySource = "enhance-chatgpt:conversation-activity";

export type ConversationActivity = {
  conversationId: string | null;
  href: string | null;
  changedAt: number;
  phase: "request" | "response" | "error";
};

type RuntimeApi = {
  getURL?: (path: string) => string;
};

type ExtensionApi = {
  runtime?: RuntimeApi;
};

type PageConversationResponse = {
  source?: unknown;
  requestId?: unknown;
  ok?: unknown;
  status?: unknown;
  body?: unknown;
  error?: unknown;
};

let installed = false;
let activityListenerInstalled = false;
let requestCounter = 0;
const activityListeners = new Set<(activity: ConversationActivity) => void>();
const recentConversationActivities: ConversationActivity[] = [];

function extensionApi(): ExtensionApi | undefined {
  const scope = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };

  return scope.browser ?? scope.chrome;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rememberConversationActivity(activity: ConversationActivity): void {
  recentConversationActivities.push(activity);
  while (recentConversationActivities.length > 20) {
    recentConversationActivities.shift();
  }

  activityListeners.forEach((listener) => listener(activity));
}

function installConversationActivityListener(): void {
  if (activityListenerInstalled) {
    return;
  }

  activityListenerInstalled = true;
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data)) {
      return;
    }

    const data = event.data;
    if (data.source !== conversationActivitySource) {
      return;
    }

    const phase = data.phase;
    if (phase !== "request" && phase !== "response" && phase !== "error") {
      return;
    }

    rememberConversationActivity({
      conversationId: typeof data.conversationId === "string" && data.conversationId.length > 0 ? data.conversationId : null,
      href: typeof data.href === "string" && data.href.length > 0 ? data.href : null,
      changedAt: typeof data.changedAt === "number" ? data.changedAt : Date.now(),
      phase
    });
  });
}

function injectPageContextBridge(): void {
  const scriptUrl = extensionApi()?.runtime?.getURL?.(pageContextScript);
  if (!scriptUrl) {
    return;
  }

  const appendScript = (): void => {
    const root = document.documentElement ?? document.head;
    if (!root) {
      document.addEventListener("DOMContentLoaded", appendScript, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = false;
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    root.append(script);
  };

  appendScript();
}

export function installChatGptApiBridge(): void {
  installConversationActivityListener();

  if (installed) {
    return;
  }

  installed = true;
  injectPageContextBridge();
}

export function subscribeConversationActivity(listener: (activity: ConversationActivity) => void): () => void {
  installChatGptApiBridge();
  activityListeners.add(listener);

  return () => {
    activityListeners.delete(listener);
  };
}

export function recentConversationActivity(): ConversationActivity[] {
  return [...recentConversationActivities];
}

export function fetchConversationInPageContext(
  conversationId: string,
  signal: AbortSignal,
  minCapturedAt: number
): Promise<unknown> {
  installChatGptApiBridge();

  if (signal.aborted) {
    return Promise.reject(new Error("Conversation request aborted"));
  }

  const requestId = `conversation-${Date.now()}-${requestCounter}`;
  requestCounter += 1;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      window.removeEventListener("message", handleMessage);
    };
    const abort = () => {
      cleanup();
      reject(new Error("Conversation request aborted"));
    };
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data)) {
        return;
      }

      const data = event.data as PageConversationResponse;
      if (data.source !== responseSource || data.requestId !== requestId) {
        return;
      }

      cleanup();

      if (data.ok === true) {
        resolve(data.body);
        return;
      }

      const detail = typeof data.error === "string" ? data.error : `Conversation request failed: ${data.status}`;
      reject(new Error(detail));
    };
    const timer = window.setTimeout(() => fail("Conversation request timed out"), 8_000);

    signal.addEventListener("abort", abort, { once: true });
    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        source: requestSource,
        requestId,
        conversationId,
        minCapturedAt
      },
      window.location.origin
    );
  });
}
