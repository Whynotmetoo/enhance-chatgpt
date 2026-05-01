(() => {
  const bridgeKey = "__enhanceChatGPTApiHeaderBridgeInstalled";
  if (window[bridgeKey]) {
    return;
  }

  window[bridgeKey] = true;

  const requestSource = "enhance-chatgpt:fetch-conversation";
  const responseSource = "enhance-chatgpt:fetch-conversation-response";
  const conversationActionRequestSource = "enhance-chatgpt:conversation-action";
  const conversationActionResponseSource = "enhance-chatgpt:conversation-action-response";
  const clearAllConversationsRequestSource = "enhance-chatgpt:clear-all-conversations";
  const clearAllConversationsResponseSource = "enhance-chatgpt:clear-all-conversations-response";
  const locationChangeSource = "enhance-chatgpt:location-changed";
  const conversationActivitySource = "enhance-chatgpt:conversation-activity";
  const conversationCache = new Map();
  const backendApiHeaders = new Map();
  const pendingConversations = new Map();
  let lastHref = window.location.href;
  const forwardedBackendHeaderNames = [
    "authorization",
    "oai-client-build-number",
    "oai-client-version",
    "oai-device-id",
    "oai-language",
    "oai-session-id",
    "x-oai-is"
  ];

  function postResponse(payload) {
    window.postMessage({ source: responseSource, ...payload }, window.location.origin);
  }

  function postConversationActionResponse(payload) {
    window.postMessage({ source: conversationActionResponseSource, ...payload }, window.location.origin);
  }

  function postClearAllConversationsResponse(payload) {
    window.postMessage({ source: clearAllConversationsResponseSource, ...payload }, window.location.origin);
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

  function conversationIdFromUrl(url) {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      const match = parsedUrl.pathname.match(/^\/c\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function postConversationActivity(phase, detail = {}) {
    window.postMessage(
      {
        source: conversationActivitySource,
        phase,
        href: window.location.href,
        conversationId: conversationIdFromUrl(window.location.href),
        changedAt: Date.now(),
        ...detail
      },
      window.location.origin
    );
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

  function urlFromInput(input) {
    return input instanceof Request ? input.url : String(input);
  }

  function isBackendApiInput(input) {
    try {
      const parsedUrl = new URL(urlFromInput(input), window.location.origin);
      return parsedUrl.origin === window.location.origin && parsedUrl.pathname.startsWith("/backend-api/");
    } catch {
      return false;
    }
  }

  function mergedRequestHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    return headers;
  }

  function rememberBackendApiRequestHeaders(input, init) {
    if (!isBackendApiInput(input)) {
      return;
    }

    const headers = mergedRequestHeaders(input, init);
    forwardedBackendHeaderNames.forEach((name) => {
      const value = headers.get(name);
      if (value) {
        backendApiHeaders.set(name, value);
      }
    });
  }

  function rememberBackendApiResponseHeaders(response) {
    const nextXOaiIs = response.headers.get("x-oai-is-update");
    if (nextXOaiIs) {
      backendApiHeaders.set("x-oai-is", nextXOaiIs);
    }
  }

  function isConversationStateInput(input) {
    const url = urlFromInput(input);

    try {
      const parsedUrl = new URL(url, window.location.origin);
      return /^\/backend-api\/f\/conversation\/?$/.test(parsedUrl.pathname);
    } catch {
      return false;
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

  function observeConversationStateResponse(responsePromise) {
    void responsePromise
      .then((response) => {
        postConversationActivity("response", {
          ok: response.ok,
          status: response.status
        });
      })
      .catch(() => postConversationActivity("error"));
  }

  function wrapFetch(fetchImplementation) {
    return function enhanceChatGPTFetch(input, init) {
      const conversationId = conversationIdFromInput(input, init);
      const isConversationStateRequest = isConversationStateInput(input);
      const isBackendApiRequest = isBackendApiInput(input);
      rememberBackendApiRequestHeaders(input, init);
      if (isConversationStateRequest) {
        postConversationActivity("request");
      }

      const responsePromise = fetchImplementation.apply(this, arguments);
      if (isBackendApiRequest) {
        void responsePromise.then((response) => rememberBackendApiResponseHeaders(response)).catch(() => undefined);
      }

      if (conversationId) {
        observeConversationResponse(conversationId, responsePromise);
      }
      if (isConversationStateRequest) {
        observeConversationStateResponse(responsePromise);
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
      const body = await waitForConversation(conversationId, minCapturedAt);

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

  async function performConversationAction(requestId, conversationId, action) {
    const body =
      action === "delete"
        ? { is_visible: false }
        : action === "archive"
          ? { is_archived: true }
          : null;

    if (!body) {
      postConversationActionResponse({
        requestId,
        action,
        conversationId,
        ok: false,
        error: "Unsupported conversation action"
      });
      return;
    }

    const path = `/backend-api/conversation/${encodeURIComponent(conversationId)}`;
    const headers = {
      "Content-Type": "application/json",
      "x-openai-target-path": path,
      "x-openai-target-route": "/backend-api/conversation/{conversation_id}"
    };
    forwardedBackendHeaderNames.forEach((name) => {
      const value = backendApiHeaders.get(name);
      if (value) {
        headers[name] = value;
      }
    });

    try {
      const response = await window.fetch(path, {
        body: JSON.stringify(body),
        credentials: "include",
        headers,
        method: "PATCH"
      });

      let error;
      if (!response.ok) {
        try {
          const text = await response.clone().text();
          error = text || `Conversation action failed: ${response.status}`;
        } catch {
          error = `Conversation action failed: ${response.status}`;
        }
      }

      postConversationActivity(response.ok ? "response" : "error", {
        action,
        conversationId,
        ok: response.ok,
        status: response.status
      });

      postConversationActionResponse({
        requestId,
        action,
        conversationId,
        ok: response.ok,
        status: response.status,
        error
      });
    } catch (error) {
      postConversationActivity("error", {
        action,
        conversationId
      });
      postConversationActionResponse({
        requestId,
        action,
        conversationId,
        ok: false,
        error: error instanceof Error ? error.message : "Conversation action failed"
      });
    }
  }

  async function clearAllConversations(requestId) {
    const path = "/backend-api/conversations";
    const headers = {
      "Content-Type": "application/json",
      "x-openai-target-path": path,
      "x-openai-target-route": "/backend-api/conversations"
    };
    forwardedBackendHeaderNames.forEach((name) => {
      const value = backendApiHeaders.get(name);
      if (value) {
        headers[name] = value;
      }
    });

    try {
      const response = await window.fetch(path, {
        body: JSON.stringify({ is_visible: false }),
        credentials: "include",
        headers,
        method: "PATCH"
      });

      let error;
      if (!response.ok) {
        try {
          const text = await response.clone().text();
          error = text || `Clear all conversations failed: ${response.status}`;
        } catch {
          error = `Clear all conversations failed: ${response.status}`;
        }
      }

      postConversationActivity(response.ok ? "response" : "error", {
        action: "clear-all",
        ok: response.ok,
        status: response.status
      });

      postClearAllConversationsResponse({
        requestId,
        ok: response.ok,
        status: response.status,
        error
      });
    } catch (error) {
      postConversationActivity("error", {
        action: "clear-all"
      });
      postClearAllConversationsResponse({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Clear all conversations failed"
      });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (!data || typeof data.requestId !== "string") {
      return;
    }

    if (data.source === requestSource) {
      if (typeof data.conversationId !== "string" || data.conversationId.length === 0) {
        postResponse({ requestId: data.requestId, ok: false, error: "Missing conversation id" });
        return;
      }

      void sendCachedConversation(
        data.requestId,
        data.conversationId,
        typeof data.minCapturedAt === "number" ? data.minCapturedAt : 0
      );
      return;
    }

    if (data.source === conversationActionRequestSource) {
      if (typeof data.conversationId !== "string" || data.conversationId.length === 0) {
        postConversationActionResponse({ requestId: data.requestId, ok: false, error: "Missing conversation id" });
        return;
      }

      void performConversationAction(data.requestId, data.conversationId, data.action);
      return;
    }

    if (data.source === clearAllConversationsRequestSource) {
      void clearAllConversations(data.requestId);
    }
  });
})();
