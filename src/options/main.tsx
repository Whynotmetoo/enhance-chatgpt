import type { ReactElement } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  FEEDBACK_EMAIL,
  GITHUB_REPOSITORY_URL,
  SUPPORT_EXTENSION_URL
} from "../shared/constants";
import "./styles.css";

function OptionsApp(): ReactElement {
  return (
    <main className="options-page">
      <section className="options-panel" aria-labelledby="options-title">
        <img className="extension-icon" src="/icons/128.png" alt="" width="88" height="88" />
        <div className="options-copy">
          <h1 id="options-title">EnhanceGPT</h1>
          <p className="description">Small upgrades for a cleaner ChatGPT workflow.</p>
        </div>

        <nav className="support-links" aria-label="Support links">
          <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
            <span>GitHub</span>
            <strong>View source</strong>
          </a>
          <a href={SUPPORT_EXTENSION_URL} target="_blank" rel="noreferrer">
            <span>Support This Extension</span>
            <strong>Donate</strong>
          </a>
          <a href={`mailto:${FEEDBACK_EMAIL}`}>
            <span>Feedback</span>
            <strong>{FEEDBACK_EMAIL}</strong>
          </a>
        </nav>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
