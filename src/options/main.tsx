import type { ReactElement } from "react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { SavedPrompt } from "../shared/promptTypes";
import { loadPrompts, savePrompts } from "../content/lib/browserStorage";
import "./styles.css";

function createPromptId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `prompt-${Date.now()}`;
}

function OptionsApp(): ReactElement {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void loadPrompts().then(setPrompts);
  }, []);

  async function persist(nextPrompts: SavedPrompt[]): Promise<void> {
    setPrompts(nextPrompts);
    await savePrompts(nextPrompts);
  }

  async function addPrompt(): Promise<void> {
    const body = draft.trim();
    if (!body) {
      return;
    }

    const firstLine = body.split(/\n+/)[0] || "Saved prompt";
    const prompt: SavedPrompt = {
      id: createPromptId(),
      title: firstLine.slice(0, 64),
      body,
      createdAt: new Date().toISOString()
    };

    await persist([prompt, ...prompts]);
    setDraft("");
  }

  return (
    <main className="options-page">
      <section className="options-header">
        <h1>Enhance ChatGPT</h1>
        <p>Saved prompts are stored locally with the extension.</p>
      </section>
      <section className="prompt-editor">
        <label htmlFor="new-prompt">New prompt</label>
        <textarea
          id="new-prompt"
          placeholder="Paste a reusable prompt..."
          rows={6}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" onClick={addPrompt}>
          Save prompt
        </button>
      </section>
      <section className="prompt-list" aria-label="Saved prompts">
        {prompts.map((prompt) => (
          <article className="prompt-card" key={prompt.id}>
            <div>
              <h2>{prompt.title}</h2>
              <p>{prompt.body}</p>
            </div>
            <button
              type="button"
              onClick={() => void persist(prompts.filter((item) => item.id !== prompt.id))}
            >
              Delete
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
