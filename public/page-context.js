(() => {
  const bridgeKey = "__enhanceChatGPTApiHeaderBridgeInstalled";
  if (window[bridgeKey]) {
    return;
  }

  window[bridgeKey] = true;

  const requestSource = "enhance-chatgpt:fetch-conversation";
  const responseSource = "enhance-chatgpt:fetch-conversation-response";
  const locationChangeSource = "enhance-chatgpt:location-changed";
  const conversationCache = new Map();
  const pendingConversations = new Map();
  let lastHref = window.location.href;

  function postResponse(payload) {
    window.postMessage({ source: responseSource, ...payload }, window.location.origin);
  }

  function postLocationChanged(changedAt = Date.now()) {
    if (lastHref === window.location.href) {
      return;
    }

    lastHref = window.location.href;
    window.postMessage(
      {
        source: locationChangeSource,
        href: lastHref,
        changedAt
      },
      window.location.origin
    );
  }

  function scheduleLocationChanged(changedAt = Date.now()) {
    if (typeof window.queueMicrotask === "function") {
      window.queueMicrotask(() => postLocationChanged(changedAt));
      return;
    }

    window.setTimeout(() => postLocationChanged(changedAt), 0);
  }

  function installLocationObserver() {
    ["pushState", "replaceState"].forEach((methodName) => {
      const originalMethod = window.history[methodName];
      if (typeof originalMethod !== "function") {
        return;
      }

      window.history[methodName] = function enhanceChatGPTHistoryMethod() {
        const result = originalMethod.apply(this, arguments);
        scheduleLocationChanged(Date.now());
        return result;
      };
    });

    window.addEventListener("popstate", () => scheduleLocationChanged());
    window.addEventListener("hashchange", () => scheduleLocationChanged());
  }

  function conversationIdFromInput(input, init) {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (String(method).toUpperCase() !== "GET") {
      return null;
    }

    const url = input instanceof Request ? input.url : String(input);

    try {
      const parsedUrl = new URL(url, window.location.origin);
      const match = parsedUrl.pathname.match(/^\/backend-api\/conversation\/([^/]+)$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function rememberConversation(conversationId, body) {
    conversationCache.set(conversationId, {
      body,
      capturedAt: Date.now()
    });

    while (conversationCache.size > 10) {
      const oldestKey = conversationCache.keys().next().value;
      conversationCache.delete(oldestKey);
    }

    const pending = pendingConversations.get(conversationId);
    if (!pending) {
      return;
    }

    pendingConversations.delete(conversationId);
    pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.resolve(body);
    });
  }

  function rejectPendingConversation(conversationId, error) {
    const pending = pendingConversations.get(conversationId);
    if (!pending) {
      return;
    }

    pendingConversations.delete(conversationId);
    pending.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.reject(error);
    });
  }

  function waitForConversation(conversationId, minCapturedAt) {
    const cached = conversationCache.get(conversationId);
    if (cached && cached.capturedAt >= minCapturedAt) {
      return Promise.resolve(cached.body);
    }

    return new Promise((resolve, reject) => {
      const pending = pendingConversations.get(conversationId) ?? new Set();
      const entry = {
        minCapturedAt,
        resolve,
        reject,
        timer: 0
      };
      const timer = window.setTimeout(() => {
        pending.delete(entry);
        if (pending.size === 0) {
          pendingConversations.delete(conversationId);
        }

        reject(new Error("ChatGPT conversation response was not captured"));
      }, 5_000);

      entry.timer = timer;
      pending.add(entry);
      pendingConversations.set(conversationId, pending);
    });
  }

  async function fetchConversation(conversationId) {
    const response = await window.fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Conversation request failed: ${response.status}`);
    }

    const body = await response.json();
    rememberConversation(conversationId, body);
    return body;
  }

  function loadConversation(conversationId, minCapturedAt) {
    const cached = conversationCache.get(conversationId);
    if (cached && cached.capturedAt >= minCapturedAt) {
      return Promise.resolve(cached.body);
    }

    return new Promise((resolve, reject) => {
      let rejectedCount = 0;
      let lastError = null;
      const handleReject = (error) => {
        rejectedCount += 1;
        lastError = error;

        if (rejectedCount === 2) {
          reject(lastError);
        }
      };

      waitForConversation(conversationId, minCapturedAt).then(resolve, handleReject);
      fetchConversation(conversationId).then(resolve, handleReject);
    });
  }

  function observeConversationResponse(conversationId, responsePromise) {
    void responsePromise
      .then((response) => {
        if (!response.ok) {
          return;
        }

        return response
          .clone()
          .json()
          .then((body) => rememberConversation(conversationId, body));
      })
      .catch((error) => rejectPendingConversation(conversationId, error));
  }

  function wrapFetch(fetchImplementation) {
    return function enhanceChatGPTFetch(input, init) {
      const conversationId = conversationIdFromInput(input, init);
      const responsePromise = fetchImplementation.apply(this, arguments);

      if (conversationId) {
        observeConversationResponse(conversationId, responsePromise);
      }

      return responsePromise;
    };
  }

  let wrappedFetch = wrapFetch(window.fetch);

  try {
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get() {
        return wrappedFetch;
      },
      set(nextFetch) {
        if (typeof nextFetch === "function") {
          wrappedFetch = wrapFetch(nextFetch);
        }
      }
    });
  } catch {
    window.fetch = wrappedFetch;
  }

  installLocationObserver();

  async function sendCachedConversation(requestId, conversationId, minCapturedAt) {
    try {
      const body = await loadConversation(conversationId, minCapturedAt);

      postResponse({
        requestId,
        ok: true,
        body
      });
    } catch (error) {
      postResponse({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Conversation response was not captured"
      });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== requestSource || typeof data.requestId !== "string") {
      return;
    }

    if (typeof data.conversationId !== "string" || data.conversationId.length === 0) {
      postResponse({ requestId: data.requestId, ok: false, error: "Missing conversation id" });
      return;
    }

    void sendCachedConversation(
      data.requestId,
      data.conversationId,
      typeof data.minCapturedAt === "number" ? data.minCapturedAt : 0
    );
  });
})();
