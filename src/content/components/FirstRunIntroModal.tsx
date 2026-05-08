import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  EXTENSION_LISTING_URL,
  GITHUB_REPOSITORY_URL
} from "../../shared/constants";
import { loadStorageFlag, saveStorageFlag } from "../lib/browserStorage";

const onboardingSeenKey = "onboarding-seen:v1";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type ExtensionGlobal = typeof globalThis & {
  browser?: { runtime?: { getURL?: (path: string) => string } };
  chrome?: { runtime?: { getURL?: (path: string) => string } };
};

function extensionResourceUrl(path: string): string {
  const scope = globalThis as ExtensionGlobal;
  try {
    return (scope.chrome ?? scope.browser)?.runtime?.getURL?.(path) ?? path;
  } catch {
    return path;
  }
}

function visibleFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function FirstRunIntroModal(): ReactElement | null {
  const descriptionId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadStorageFlag(onboardingSeenKey).then((hasSeenOnboarding) => {
      if (!cancelled && !hasSeenOnboarding) {
        setOpen(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = visibleFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocusedElement?.focus({ preventScroll: true });
    };
  }, [open]);

  function dismiss(): void {
    setOpen(false);
    void saveStorageFlag(onboardingSeenKey, true);
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <button
        aria-label="Close EnhanceGPT welcome"
        className="ecg-intro-overlay"
        type="button"
        onClick={dismiss}
      />
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="ecg-intro-modal"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="ecg-intro-header">
          <span className="ecg-intro-logo" aria-hidden="true">
            <img src={extensionResourceUrl("icons/icon-transparent.svg")} alt="" width="34" height="34" />
          </span>
          <p className="ecg-intro-eyebrow">Welcome</p>
          <h2 id={titleId}>EnhanceGPT is ready</h2>
          <button
            aria-label="Close"
            className="ecg-intro-close"
            ref={closeButtonRef}
            type="button"
            onClick={dismiss}
          >
            X
          </button>
        </header>

        <div className="ecg-intro-body">
          <p className="ecg-intro-lede" id={descriptionId}>
            EnhanceGPT adds a small set of native-feeling workflow upgrades to ChatGPT.
          </p>

          <p className="ecg-intro-copy">
            Use it to manage conversations faster, reuse saved prompts, and navigate long chats
            with a lightweight outline. It stays out of the way and blends into the ChatGPT
            interface instead of replacing it.
          </p>

          <p className="ecg-intro-compatibility">Works on chatgpt.com and chat.openai.com.</p>

          <ul className="ecg-intro-feature-list" aria-label="EnhanceGPT features">
            <li>Bulk-select conversations from the ChatGPT sidebar</li>
            <li>Quickly access saved prompt snippets from the composer</li>
            <li>View a lightweight outline for long conversations</li>
          </ul>

          <section className="ecg-intro-privacy" aria-labelledby="ecg-intro-privacy-title">
            <h3 id="ecg-intro-privacy-title">Data and privacy</h3>
            <p>
              EnhanceGPT does not send your saved prompts or conversation data to an external
              server. Data used by the extension is handled locally in your browser with Chrome
              extension storage.
            </p>
          </section>

          <nav className="ecg-intro-links" aria-label="EnhanceGPT links">
            <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
              GitHub repository
            </a>
            <a href={EXTENSION_LISTING_URL} target="_blank" rel="noreferrer">
              Plugin site
            </a>
          </nav>
        </div>

        <footer className="ecg-intro-footer">
          <button className="ecg-intro-primary" type="button" onClick={dismiss}>
            Get started
          </button>
        </footer>
      </section>
    </>,
    document.body
  );
}
