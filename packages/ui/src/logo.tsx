/**
 * The Gami.Fied mark: an orange "G" on near-black. `brand/mark.svg` is the same drawing as a file,
 * for favicons and anything that needs an image. Keep the two in step.
 */
import React from 'react';

export interface LogoMarkProps extends React.SVGProps<SVGSVGElement> {
  /** Width and height in pixels. */
  size?: number;
  /** Read out by screen readers. Leave empty when a visible name sits next to the mark. */
  title?: string;
}

export function LogoMark({ size = 28, title, ...props }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      <rect width="64" height="64" fill="#09090b" />
      <path d="M46 20H18v24h28V33H33" fill="none" stroke="#f97316" strokeWidth="7" strokeLinecap="square" />
    </svg>
  );
}
