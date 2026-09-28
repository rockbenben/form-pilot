import React from 'react';
import type { FillStatus } from '@/lib/engine/adapters/types';

/**
 * Monochrome inline SVGs in Chrome's idiom: 24-unit grid, currentColor fill.
 * The UI must not contain emoji icons — see DESIGN.md “Icons”.
 */
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ flex: 'none', ...rest.style }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}><path d="M11 21v-7H6l5-11v7h5l-5 11z" /></Icon>
);
export const SaveIcon = (p: IconProps) => (
  <Icon {...p}><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10v4z" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></Icon>
);
export const WarnIcon = (p: IconProps) => (
  <Icon {...p}><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></Icon>
);
export const EditIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></Icon>
);
export const BlockIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 17.7A7.96 7.96 0 0 1 4 12zm8 8a8 8 0 0 1-6.3-1.7L17.7 6.3A8 8 0 0 1 12 20z" /></Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></Icon>
);
export const StarIcon = ({ filled = true, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}>
    <path
      d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
    />
  </Icon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></Icon>
);
export const ArrowForwardIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></Icon>
);
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" /></Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}><path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.67 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.03 7.03 0 0 0 1.62-.94l2.39.96c.22.1.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" /></Icon>
);

export const STATUS_ICON: Record<FillStatus, (p: IconProps) => React.ReactElement> = {
  filled: CheckIcon,
  uncertain: WarnIcon,
  empty: EditIcon,
  unrecognized: BlockIcon,
};
