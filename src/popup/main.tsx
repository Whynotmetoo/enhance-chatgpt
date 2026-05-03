import type { ReactElement } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  GITHUB_NEW_ISSUE_URL,
  GITHUB_REPOSITORY_URL,
  SUPPORT_EXTENSION_URL
} from "../shared/constants";
import "./styles.css";

function PopupApp(): ReactElement {
  return (
    <main className="popup-page">
      <header className="popup-header">
        <img src="/icons/48.png" alt="" width="40" height="40" />
        <div>
          <h1>EnhanceGPT</h1>
          <p>This extension is active on ChatGPT.</p>
        </div>
      </header>

      <nav className="popup-actions" aria-label="Extension links">
        <a href={SUPPORT_EXTENSION_URL} target="_blank" rel="noreferrer">
          Support development
        </a>
        <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
          View source on GitHub
        </a>
        <a href={GITHUB_NEW_ISSUE_URL} target="_blank" rel="noreferrer">
          Report an issue
        </a>
      </nav>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>
);
