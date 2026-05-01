import type { ReactElement } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

type PromptIconButtonProps = {
  children: ReactElement;
  label: string;
  onClick: () => void;
};

export function PromptIconButton({ children, label, onClick }: PromptIconButtonProps): ReactElement {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={label}
          className="ecg-prompt-icon-button"
          type="button"
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
            }
          }}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="ecg-prompt-tooltip" side="top" sideOffset={7}>
          {label}
          <Tooltip.Arrow className="ecg-prompt-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
