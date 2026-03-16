"use client";

import type { ReactNode } from "react";

type SvgProps = {
  children: ReactNode;
  title?: string;
};

function IconBase({ children, title }: SvgProps): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function PencilIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </IconBase>
  );
}

export function EyeIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function EyeOffIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.7 21.7 0 0 1 5.06-6.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.7 21.7 0 0 1-4.87 6.87" />
      <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </IconBase>
  );
}

export function TrashIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </IconBase>
  );
}

export function SearchIcon(): JSX.Element {
  return (
    <IconBase>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </IconBase>
  );
}

export function BellIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </IconBase>
  );
}

export function UserIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconBase>
  );
}

export function MoonIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </IconBase>
  );
}

export function SunIcon(): JSX.Element {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </IconBase>
  );
}

export function SendIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </IconBase>
  );
}

export function ChevronUpIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M18 15l-6-6-6 6" />
    </IconBase>
  );
}

export function ChevronDownIcon(): JSX.Element {
  return (
    <IconBase>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  );
}
