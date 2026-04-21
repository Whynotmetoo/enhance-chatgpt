import type { DependencyList } from "react";
import { useLayoutEffect, useState } from "react";

type RectState = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

function fromDomRect(rect: DOMRect): RectState {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom
  };
}

export function useElementRect(
  getElement: () => HTMLElement | null,
  dependencies: DependencyList = [],
  pollInterval = 500
): RectState | null {
  const [rect, setRect] = useState<RectState | null>(null);

  useLayoutEffect(() => {
    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const element = getElement();
        setRect(element ? fromDomRect(element.getBoundingClientRect()) : null);
      });
    };

    update();

    const interval = window.setInterval(update, pollInterval);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, dependencies);

  return rect;
}
