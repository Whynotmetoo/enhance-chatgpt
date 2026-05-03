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

function FilledIconBase({ children, ...props }: IconProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChatGptMoreIcon(props: IconProps): ReactElement {
  return (
    <FilledIconBase {...props}>
      <path d="M15.498 8.502a1.498 1.498 0 1 1 0 2.996 1.498 1.498 0 0 1 0-2.996M4.498 8.502a1.499 1.499 0 1 1 0 2.998 1.499 1.499 0 0 1 0-2.998M10 8.502a1.498 1.498 0 1 1 0 2.996 1.498 1.498 0 0 1 0-2.996" />
    </FilledIconBase>
  );
}

export function ChatGptDataControlsIcon(props: IconProps): ReactElement {
  return (
    <FilledIconBase {...props}>
      <path d="M14 13.333a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5" />
      <path
        clipRule="evenodd"
        d="M14.626 10.195c.353.05.668.247.87.54l.09.153.253.507.567-.034c.482-.028.94.217 1.18.635l.448.774.08.162c.132.33.12.702-.033 1.022l-.088.156-.312.473.312.473.088.156c.152.32.165.692.032 1.022l-.079.162-.447.774c-.211.366-.588.6-1.001.633l-.18.002-.567-.035-.252.507c-.189.378-.55.635-.961.694l-.179.012h-.895c-.483 0-.923-.274-1.139-.705l-.255-.508-.564.035a1.27 1.27 0 0 1-1.18-.635v-.001l-.447-.773a1.28 1.28 0 0 1 .039-1.34l.312-.473-.311-.474-.001.001a1.28 1.28 0 0 1-.04-1.34l.448-.774c.241-.417.696-.663 1.179-.635l.566.034.254-.507.09-.154a1.27 1.27 0 0 1 1.049-.551h.895zM13.13 12.36a.65.65 0 0 1-.62.358l-.979-.059-.431.748.54.82a.65.65 0 0 1 0 .714l-.54.819.431.748.979-.059.096.001a.65.65 0 0 1 .524.357l.438.877h.863l.437-.876.05-.083a.65.65 0 0 1 .571-.276l.98.059.431-.746-.54-.82a.65.65 0 0 1 0-.716l.54-.82-.431-.747-.98.059a.65.65 0 0 1-.62-.359l-.438-.875h-.863z"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M10 1.835c1.666 0 3.204.24 4.349.65.569.203 1.078.46 1.456.78.375.316.694.76.694 1.318v3.75a.666.666 0 0 1-1.33 0V6.324c-.251.135-.528.254-.82.359-1.145.408-2.683.649-4.349.649s-3.203-.24-4.348-.65a6 6 0 0 1-.82-.358V10l.016.06a.5.5 0 0 0 .095.137c.112.123.305.267.6.415.516.26 1.254.483 2.15.628l.393.058.132.031a.666.666 0 0 1-.17 1.292l-.134-.004-.43-.062c-.987-.16-1.866-.416-2.538-.753q-.058-.03-.114-.063v3.678c0 .015.005.079.111.196.112.123.305.268.6.416.59.296 1.47.546 2.543.686a.666.666 0 0 1-.172 1.32c-1.162-.152-2.2-.432-2.968-.817-.383-.192-.728-.426-.986-.71-.262-.287-.458-.656-.458-1.091V4.583c0-.559.32-1.002.694-1.318.378-.32.887-.577 1.456-.78 1.145-.41 2.682-.65 4.348-.65m0 1.33c-1.555 0-2.934.226-3.9.571-.486.174-.833.365-1.045.544-.214.18-.223.286-.223.303 0 .016.008.121.223.303.212.179.559.371 1.045.545.966.345 2.345.57 3.9.57s2.935-.225 3.901-.57c.486-.174.833-.366 1.045-.545.215-.182.223-.287.223-.303s-.01-.122-.223-.303c-.212-.179-.559-.37-1.045-.544-.966-.345-2.346-.57-3.901-.571"
        fillRule="evenodd"
      />
    </FilledIconBase>
  );
}

export function ChatGptArchiveIcon(props: IconProps): ReactElement {
  return (
    <FilledIconBase {...props}>
      <path d="M11.8 10.182a.665.665 0 0 1 0 1.302l-.134.014H8.333a.665.665 0 0 1 0-1.33h3.333z" />
      <path
        clipRule="evenodd"
        d="M15.417 2.668A2.333 2.333 0 0 1 17.749 5v.833c0 .499-.159.96-.426 1.339q.006.038.008.078v5.417c0 .689 0 1.246-.036 1.696-.033.4-.098.762-.242 1.098l-.067.143c-.265.52-.67.956-1.165 1.26l-.217.122c-.377.192-.784.271-1.242.309-.45.037-1.007.037-1.696.037H7.333c-.689 0-1.246 0-1.696-.037-.4-.033-.762-.097-1.098-.241l-.143-.068a3.17 3.17 0 0 1-1.261-1.165l-.122-.217c-.192-.377-.271-.783-.309-1.24-.037-.45-.036-1.008-.036-1.697V7.25q.002-.04.008-.08a2.3 2.3 0 0 1-.424-1.337V5a2.333 2.333 0 0 1 2.332-2.332zm.584 5.42a2.3 2.3 0 0 1-.584.077H4.584c-.203 0-.399-.029-.586-.077v4.579c0 .71 0 1.204.032 1.588.031.375.088.587.168.745l.07.126c.177.287.43.522.732.676l.13.055c.144.052.333.09.615.113.384.031.877.032 1.588.032h5.333c.71 0 1.204-.001 1.588-.032.375-.03.587-.088.745-.168l.127-.072c.287-.176.522-.428.676-.73l.055-.13c.052-.144.09-.334.113-.615.031-.384.031-.877.031-1.588zM4.584 3.998c-.553 0-1.002.449-1.002 1.002v.833c0 .553.449 1.002 1.002 1.002h10.833c.553 0 1.002-.449 1.002-1.002V5c0-.553-.45-1.002-1.002-1.002z"
        fillRule="evenodd"
      />
    </FilledIconBase>
  );
}

export function ChatGptTrashIcon(props: IconProps): ReactElement {
  return (
    <FilledIconBase {...props}>
      <path d="M10.63 1.335c1.403 0 2.64.925 3.036 2.271l.215.729H17l.134.014a.665.665 0 0 1 0 1.302L17 5.665h-.346l-.797 9.326a3.165 3.165 0 0 1-3.153 2.897H7.296a3.166 3.166 0 0 1-3.113-2.594l-.04-.303-.796-9.326H3a.665.665 0 0 1 0-1.33h3.12l.214-.729.084-.248A3.165 3.165 0 0 1 9.37 1.335zM5.468 14.878l.023.176a1.835 1.835 0 0 0 1.805 1.504h5.408c.953 0 1.747-.73 1.828-1.68l.787-9.213H4.682zm2.2-2.05V8.66a.665.665 0 0 1 1.33 0v4.167a.665.665 0 0 1-1.33 0m3.334 0V8.66a.665.665 0 1 1 1.33 0v4.167a.665.665 0 0 1-1.33 0M9.37 2.664c-.763 0-1.44.47-1.712 1.173l-.049.143-.103.354h4.988l-.103-.354a1.835 1.835 0 0 0-1.761-1.316z" />
    </FilledIconBase>
  );
}

export function HeartIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M20.8 8.6c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.8 4.8 0 0 1 12 5.9a4.8 4.8 0 0 1 8.8 2.7z" />
    </IconBase>
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

export function ArchivePageIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M4 7h16v4H4z" />
      <path d="M6 11v8h12v-5" />
      <path d="M10 15h3" />
      <path d="M15 14h5v5" />
      <path d="M14 20l6-6" />
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

export function PluginIcon(props: IconProps): ReactElement {
  return (
    <IconBase {...props}>
      <path d="M9 3h6v4h2a4 4 0 0 1 4 4v2h-4v6H7v-6H3v-2a4 4 0 0 1 4-4h2z" />
      <path d="M10 19v2" />
      <path d="M14 19v2" />
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

export function ChatGptAddIcon(props: IconProps): ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 20 20"
      width="20"
      {...props}
    >
      <path d="M10 4.5v11" />
      <path d="M4.5 10h11" />
    </svg>
  );
}

export function ChatGptEditIcon(props: IconProps): ReactElement {
  return (
    <svg aria-hidden="true" height="20" width="20" {...props}>
      <use href="/cdn/assets/sprites-core-6d2147a0.svg#6d87e1" fill="currentColor" />
    </svg>
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
