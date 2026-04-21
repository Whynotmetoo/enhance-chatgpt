export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = globalThis.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

export function closestVisible<T extends HTMLElement>(
  selectors: string[]
): T | null {
  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll<T>(selector)).find(isVisible);
    if (element) {
      return element;
    }
  }

  return null;
}

export function findPromptInput(): HTMLElement | null {
  return closestVisible<HTMLElement>([
    "#prompt-textarea",
    "[data-testid='composer'] [contenteditable='true']",
    "form [contenteditable='true']",
    "form textarea",
    "main textarea"
  ]);
}

export function readPromptInput(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.value;
  }

  return input.innerText || input.textContent || "";
}

export function writePromptInput(input: HTMLElement, value: string): void {
  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value"
    );
    descriptor?.set?.call(input, value);
  } else {
    input.textContent = value;
  }

  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    })
  );

  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function isPromptInputTarget(target: EventTarget | null): boolean {
  const input = findPromptInput();

  return Boolean(input && target instanceof Node && input.contains(target));
}

export function conversationIdFromHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/\/c\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function debounce(callback: () => void, wait = 120): () => void {
  let timer = 0;

  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(callback, wait);
  };
}
