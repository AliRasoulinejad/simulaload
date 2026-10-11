import type { ReactElement, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 4.5v15l13 -7.5z" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" />
    </svg>
  );
}

export function CdnIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 4 5.3 4 8.5s-1.4 6.1-4 8.5c-2.6 -2.4-4-5.3-4-8.5s1.4-6.1 4-8.5z" />
    </svg>
  );
}

export function LoadBalancerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="5" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="M7 12h2M11 12l6 -5.6M11 12h6M11 12l6 5.6" />
    </svg>
  );
}

export function ApplicationIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.6" />
      <path d="M3.5 8.8h17M7 6.4h.01M9.3 6.4h.01" />
    </svg>
  );
}

export function CacheIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2l8.6 4.8l-8.6 4.8l-8.6 -4.8z" />
      <path d="M3.4 12.6l8.6 4.8l8.6 -4.8M3.4 17.3l8.6 4.8l8.6 -4.8" />
    </svg>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="12" cy="5.4" rx="8" ry="3" />
      <path d="M4 5.4v13.2c0 1.66 3.58 3 8 3s8 -1.34 8 -3V5.4" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8 -1.34 8 -3" />
    </svg>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11M8 11l4 4l4 -4" />
      <path d="M4.5 16v2.6c0 1.05 .85 1.9 1.9 1.9h11.2c1.05 0 1.9 -.85 1.9 -1.9V16" />
    </svg>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 14.5v-11M8 7l4 -4l4 4" />
      <path d="M4.5 16v2.6c0 1.05 .85 1.9 1.9 1.9h11.2c1.05 0 1.9 -.85 1.9 -1.9V16" />
    </svg>
  );
}

export const componentIcons: Record<string, (props: IconProps) => ReactElement> = {
  cdn: CdnIcon,
  loadBalancer: LoadBalancerIcon,
  application: ApplicationIcon,
  cache: CacheIcon,
  database: DatabaseIcon,
};
