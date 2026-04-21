import type { ReactElement, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="16"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DeleteIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </IconBase>
  );
}

export function ArchiveIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M4 7h16v4H4z" />
      <path d="M6 11v8h12v-8" />
      <path d="M10 15h4" />
    </IconBase>
  );
}

export function DotsIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function PromptIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M6 4h12v16l-6-3-6 3z" />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </IconBase>
  );
}

export function CodeIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M9 18l-6-6 6-6" />
      <path d="M15 6l6 6-6 6" />
    </IconBase>
  );
}
