import type { ReactElement, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type AlertModalProps = {
  children: ReactNode;
  contentClassName: string;
  description: string;
  descriptionClassName: string;
  disableEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
  overlayClassName: string;
  title: string;
  titleClassName: string;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function visibleFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function AlertModal({
  children,
  contentClassName,
  description,
  descriptionClassName,
  disableEscape = false,
  initialFocusRef,
  onClose,
  open,
  overlayClassName,
  title,
  titleClassName
}: AlertModalProps): ReactElement | null {
  const descriptionId = useId();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const disableEscapeRef = useRef(disableEscape);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    disableEscapeRef.current = disableEscape;
    onCloseRef.current = onClose;
  }, [disableEscape, onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      (initialFocusRef?.current ?? dialogRef.current)?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!disableEscapeRef.current) {
          onCloseRef.current();
        }
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

  if (!open) {
    return null;
  }

  return createPortal(
    <>
      <div className={overlayClassName} />
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={contentClassName}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h2 className={titleClassName} id={titleId}>
          {title}
        </h2>
        <p className={descriptionClassName} id={descriptionId}>
          {description}
        </p>
        {children}
      </div>
    </>,
    document.body
  );
}
