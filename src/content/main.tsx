import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EnhancementRoot } from "./components/EnhancementRoot";
import "./styles.css";
import { EXTENSION_NAMESPACE } from "../shared/constants";
import { installChatGptApiBridge } from "./lib/chatGptApiBridge";

const rootId = `${EXTENSION_NAMESPACE}-root`;

installChatGptApiBridge();

function mount(): void {
  if (document.getElementById(rootId)) {
    return;
  }

  const host = document.body;
  if (!host) {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
    return;
  }

  const container = document.createElement("div");
  container.id = rootId;
  container.setAttribute("data-enhance-chatgpt", "root");
  host.append(container);

  createRoot(container).render(
    <StrictMode>
      <EnhancementRoot />
    </StrictMode>
  );
}

function scheduleMount(): void {
  const run = (): void => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => mount(), { timeout: 1_500 });
      return;
    }

    globalThis.setTimeout(mount, 250);
  };

  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleMount, { once: true });
} else {
  scheduleMount();
}
