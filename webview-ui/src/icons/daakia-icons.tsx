/**
 * Centralized icon registry for Daakia.
 * All SVG icons live here — import and reuse throughout the app.
 * Each icon is a React component accepting standard SVG props.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function withDefaults(props: IconProps, defaults: Partial<IconProps> = {}) {
  const { size = defaults.size ?? 14, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

// ─── Action Icons ───────────────────────────────────────────────────────────

export function UndoIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.13-9.36L23 10" />
    </svg>
  );
}

export function CutIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function PasteIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

export function SelectAllIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 12h8" />
      <path d="M8 8h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function RenameIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CloseCircleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function CloseSquareIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="7" r="5" />
    </svg>
  );
}

export function UnpinIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="7" r="5" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export function ArrowToRightIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="9 6 15 12 9 18" />
      <line x1="18" y1="4" x2="18" y2="20" />
    </svg>
  );
}

export function ArrowToLeftIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="15 6 9 12 15 18" />
      <line x1="6" y1="4" x2="6" y2="20" />
    </svg>
  );
}

export function CloseAllIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="3" x2="21" y2="21" />
      <line x1="21" y1="3" x2="3" y2="21" />
    </svg>
  );
}

export function SaveCheckIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function PlusSquareIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <path d="M6 6h.01M6 18h.01" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  const { size = 24, className = '', ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} {...rest}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

// ─── Protocol / Brand Icons (custom viewBox) ─────────────────────────────────

export function GlobeIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

export function CookieIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M12 2a10 10 0 1010 10" />
      <path d="M12 2a10 10 0 0010 10" strokeDasharray="2 4" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** REST/API icon — gear cog with circular sync arrows (API lifecycle). */
export function RestApiIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {/* Outer circular arrows */}
      <path d="M21 3v4h-4" />
      <path d="M3 21v-4h4" />
      <path d="M21 7A9.96 9.96 0 0012 2a9.96 9.96 0 00-7.071 2.929L3 7" />
      <path d="M3 17a9.96 9.96 0 009 5 9.96 9.96 0 007.071-2.929L21 17" />
      {/* Inner gear/cog */}
      <path d="M12 8v1m0 6v1m3.5-5.5l-.7.7m-5.6 5.6l-.7.7m7-.7l-.7-.7m-5.6-5.6l-.7-.7" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function GraphQLIcon(props: IconProps) {
  const { size = 20, className, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" className={className} {...rest}>
      <g fill="currentColor">
        <rect x="122" y="-0.4" transform="matrix(-0.866 -0.5 0.5 -0.866 163.3196 363.3136)" width="16.6" height="320.3"/>
        <rect x="39.8" y="272.2" width="320.3" height="16.6"/>
        <rect x="37.9" y="312.2" transform="matrix(-0.866 -0.5 0.5 -0.866 83.0693 663.3409)" width="185" height="16.6"/>
        <rect x="177.1" y="71.1" transform="matrix(-0.866 -0.5 0.5 -0.866 463.3409 283.0693)" width="185" height="16.6"/>
        <rect x="122.1" y="-13" transform="matrix(-0.5 -0.866 0.866 -0.5 126.7903 232.1221)" width="16.6" height="185"/>
        <rect x="109.6" y="151.6" transform="matrix(-0.5 -0.866 0.866 -0.5 266.0828 473.3766)" width="320.3" height="16.6"/>
        <rect x="52.5" y="107.5" width="16.6" height="185"/>
        <rect x="330.9" y="107.5" width="16.6" height="185"/>
        <rect x="262.4" y="240.1" transform="matrix(-0.5 -0.866 0.866 -0.5 126.7953 714.2875)" width="14.5" height="160.9"/>
        <path d="M369.5,297.9c-9.6,16.7-31,22.4-47.7,12.8c-16.7-9.6-22.4-31-12.8-47.7c9.6-16.7,31-22.4,47.7-12.8C373.5,259.9,379.2,281.2,369.5,297.9"/>
        <path d="M90.9,137c-9.6,16.7-31,22.4-47.7,12.8c-16.7-9.6-22.4-31-12.8-47.7c9.6-16.7,31-22.4,47.7-12.8C94.8,99,100.5,120.3,90.9,137"/>
        <path d="M30.5,297.9c-9.6-16.7-3.9-38,12.8-47.7c16.7-9.6,38-3.9,47.7,12.8c9.6,16.7,3.9,38-12.8,47.7C61.4,320.3,40.1,314.6,30.5,297.9"/>
        <path d="M309.1,137c-9.6-16.7-3.9-38,12.8-47.7c16.7-9.6,38-3.9,47.7,12.8c9.6,16.7,3.9,38-12.8,47.7C340.1,159.4,318.7,153.7,309.1,137"/>
        <path d="M200,395.8c-19.3,0-34.9-15.6-34.9-34.9c0-19.3,15.6-34.9,34.9-34.9c19.3,0,34.9,15.6,34.9,34.9C234.9,380.1,219.3,395.8,200,395.8"/>
        <path d="M200,74c-19.3,0-34.9-15.6-34.9-34.9c0-19.3,15.6-34.9,34.9-34.9c19.3,0,34.9,15.6,34.9,34.9C234.9,58.4,219.3,74,200,74"/>
      </g>
    </svg>
  );
}

export function WebSocketIcon(props: IconProps) {
  const { size = 20, className, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} {...rest}>
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10"/>
      <path fill="currentColor" d="M 66.23 62.237 L 74.235 62.237 L 74.235 43.019 L 65.218 34.002 L 59.557 39.661 L 66.23 46.334 L 66.23 62.237 Z M 74.254 66.249 L 62.597 66.249 L 46.336 66.249 L 39.662 59.577 L 42.492 56.746 L 48.005 62.259 L 59.345 62.259 L 48.173 51.066 L 51.024 48.215 L 62.196 59.387 L 62.196 48.046 L 56.706 42.556 L 59.514 39.747 L 45.639 25.808 L 31.954 25.808 L 31.954 25.808 L 17.763 25.808 L 25.746 33.791 L 25.746 33.812 L 25.788 33.812 L 42.304 33.812 L 48.153 39.661 L 39.599 48.215 L 33.751 42.365 L 33.751 37.825 L 25.746 37.825 L 25.746 45.68 L 39.599 59.535 L 33.961 65.174 L 42.978 74.192 L 56.662 74.192 L 82.238 74.192 L 82.238 74.192 L 74.254 66.249 Z"/>
    </svg>
  );
}

// ─── Sidebar Section Icons ───────────────────────────────────────────────────

export function CollectionsFolderIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </svg>
  );
}

// ─── Toggle / State Icons ────────────────────────────────────────────────────

export function CheckCircleFilledIcon(props: IconProps & { checked?: boolean }) {
  const { checked = true, size = 14, ...rest } = props;
  const color = checked ? 'var(--color-success)' : 'currentColor';
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      {checked ? (
        <>
          <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
          <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
      )}
    </svg>
  );
}

export function DotIcon(props: IconProps) {
  const { size = 12, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...rest}>
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

// ─── Progress Stage Icons ────────────────────────────────────────────────────

/** Circle with checkmark — for completed progress stages. Uses accent color via CSS var. */
export function StageCheckIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0" {...rest}>
      <circle cx="8" cy="8" r="6" stroke="var(--color-accent)" strokeWidth="1.5" />
      <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Circle with X — for errored progress stages. */
export function StageErrorIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0" {...rest}>
      <circle cx="8" cy="8" r="6" stroke="var(--color-error)" strokeWidth="1.5" />
      <path d="M6 6L10 10M10 6L6 10" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Empty circle — for pending progress stages. */
export function StagePendingIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0" {...rest}>
      <circle cx="8" cy="8" r="6" stroke="var(--color-surface-border)" strokeWidth="1.5" />
    </svg>
  );
}

/** Spinning arc circle — for running progress stages. Uses native SVG animateTransform (CSS-independent). */
export function StageSpinIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      <circle cx="8" cy="8" r="6" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="10 28" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** Pulsing circle background — for running progress stages. Uses native SVG animate. */
export function StagePulseIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      <circle cx="8" cy="8" r="6" stroke="var(--color-accent)" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function AttachmentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function MoreHorizontalIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function ExportIcon(props: IconProps) {
  return <DownloadIcon {...props} />;
}

// ─── Additional Icons (migrated from inline SVGs) ────────────────────────────

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function MoreVerticalIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props, { size: 13 })} stroke="none" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

export function WrapLinesIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M3 6h18" />
      <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
      <polyline points="16 16 14 18 16 20" />
      <path d="M3 18h7" />
    </svg>
  );
}

export function InfoCircleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function WarningTriangleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function BulkEditIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M18 14l.75 2.25L21 17l-2.25.75L18 20l-.75-2.25L15 17l2.25-.75L18 14z" />
    </svg>
  );
}

export function WandIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8l1.4 1.4" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2l1.4-1.4" />
      <path d="M3 21l9-9" />
      <path d="M12.2 6.2L10.8 4.8" />
    </svg>
  );
}

export function FileUploadIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polyline points="12 18 12 12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  );
}

export function DragHandleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)} stroke="none" fill="currentColor">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

export function FilePlusIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="12" y1="12" x2="12" y2="18" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

export function FolderPlusIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <line x1="12" y1="10.5" x2="12" y2="16.5" />
      <line x1="9" y1="13.5" x2="15" y2="13.5" />
    </svg>
  );
}

export function DuplicateIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function CpuIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}

export function CodeBracketsIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export function HelpCircleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function VariableIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M8 21s-4-3-4-9 4-9 4-9" />
      <path d="M16 3s4 3 4 9-4 9-4 9" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2" />
      <path d="M2 10l2.5 9h15l2.5-9H2z" />
    </svg>
  );
}

export function FolderImportIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
      <path d="M12 10v6" />
      <path d="m15 13-3 3-3-3" />
    </svg>
  );
}

export function FolderExportIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
      <path d="M12 16v-6" />
      <path d="m9 13 3-3 3 3" />
    </svg>
  );
}

export function FolderTransferIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
      {/* Down arrow (import) */}
      <path d="M9 10v5" />
      <path d="m7 13 2 2 2-2" />
      {/* Up arrow (export) */}
      <path d="M15 15v-5" />
      <path d="m13 12 2-2 2 2" />
    </svg>
  );
}

export function DropdownArrowIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 12 7" fill="none">
      <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PanelMinimizeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M4 12h16" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PanelMaximizeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function DiagonalLinesPattern({ patternId, stroke = 'var(--color-mock-server-muted)' }: { patternId: string; stroke?: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full rounded-lg opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={stroke} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4z" />
    </svg>
  );
}

export function ReplSendIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M5 3l14 9-14 9V3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

export function WifiIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 20h.01" />
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.859a10 10 0 0 1 14 0" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
    </svg>
  );
}

export function RadioIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M7 17L17 7M17 7H9M17 7V15" />
    </svg>
  );
}

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M17 7L7 17M7 17H15M7 17V9" />
    </svg>
  );
}

export function AutoScrollIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export function TimelineIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M4 12h16" />
      <path d="M4 6h16" />
      <path d="M4 18h16" />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Debugger Icons ──────────────────────────────────────────────────────────

export function BugIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M8 2l1.88 1.88" />
      <path d="M14.12 3.88L16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

export function StepOverIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M5 16V8" />
      <path d="M5 8l4 4-4 4" />
      <path d="M12 4h4a4 4 0 0 1 0 8h-4" />
      <path d="M16 16l-4-4 4-4" />
    </svg>
  );
}

export function StopSquareIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function VariablesIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  );
}

export function OutputIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function StepIntoIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </svg>
  );
}

export function StepOutIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 21V9" />
      <path d="M8 13l4-4 4 4" />
      <line x1="4" y1="3" x2="20" y2="3" />
    </svg>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function DevToolsIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M16 18 22 12 16 6" />
      <path d="M8 6 2 12 8 18" />
    </svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />
      <path d="M12 6v2" />
      <path d="M16.24 7.76l-1.42 1.42" />
      <path d="M18 12h-2" />
      <path d="M12 12l-3.5-3.5" />
    </svg>
  );
}

export function LineNumbersIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M5 4v16" />
      <path d="M3 8h4" />
      <path d="M10 6h10" />
      <path d="M10 12h10" />
      <path d="M10 18h10" />
    </svg>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M2 9h2" /><path d="M2 15h2" />
      <path d="M20 9h2" /><path d="M20 15h2" />
      <path d="M9 2v2" /><path d="M15 2v2" />
      <path d="M9 20v2" /><path d="M15 20v2" />
    </svg>
  );
}

export function UptimeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function ProcessIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 8h2" /><path d="M7 11h4" />
    </svg>
  );
}

// ─── Realtime Protocol Icons ─────────────────────────────────────────────────

export function RealtimeIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M12 2a10 10 0 1 0 10 10" />
      <path d="M12 2a14.5 14.5 0 0 1 2 10" />
      <path d="M12 2c-2.5 3-4 6.5-4 10s1.5 7 4 10" />
      <path d="M2 12h10" />
      <path d="M19 5l-2 5h5l-2 5" />
    </svg>
  );
}

export function SSEIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M4 10a7.31 7.31 0 0 0 10 10Z" />
      <path d="M9 15l3-3" />
      <path d="M18 16a6 6 0 0 0-6-6" />
      <path d="M22 16A10 10 0 0 0 11 3" />
    </svg>
  );
}

export function SocketIOIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none" {...rest}>
      <path fillRule="evenodd" clipRule="evenodd" d="M9.277 2.084a.5.5 0 0 1 .185.607l-2.269 5.5a.5.5 0 0 1-.462.309H3.5a.5.5 0 0 1-.354-.854l5.5-5.5a.5.5 0 0 1 .631-.062ZM4.707 7.5h1.69l1.186-2.875L4.707 7.5Zm2.016 6.416a.5.5 0 0 1-.185-.607l2.269-5.5a.5.5 0 0 1 .462-.309H12.5a.5.5 0 0 1 .354.854l-5.5 5.5a.5.5 0 0 1-.631.062Zm4.57-5.416h-1.69l-1.186 2.875L11.293 8.5Z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1 0A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
    </svg>
  );
}

export function MQTTIcon(props: IconProps) {
  const { size = 20, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none" {...rest}>
      <path fillRule="evenodd" clipRule="evenodd" d="M10.133 1h4.409a.5.5 0 0 1 .5.5v4.422c0 .026-.035.033-.045.01l-.048-.112a9.095 9.095 0 0 0-4.825-4.776c-.023-.01-.016-.044.01-.044Zm-8.588.275h-.5v1h.5c7.027 0 12.229 5.199 12.229 12.226v.5h1v-.5c0-7.58-5.65-13.226-13.229-13.226Zm.034 4.22h-.5v1h.5c2.361 0 4.348.837 5.744 2.238 1.395 1.401 2.227 3.395 2.227 5.758v.5h1v-.5c0-2.604-.921-4.859-2.52-6.463-1.596-1.605-3.845-2.532-6.45-2.532Zm-.528 8.996v-4.423c0-.041.033-.074.074-.074a4.923 4.923 0 0 1 4.923 4.922.074.074 0 0 1-.074.074H1.551a.5.5 0 0 1-.5-.5Z" />
    </svg>
  );
}

// ─── Debugger Icons (VS Code codicons, colorized) ───────────────────────────

export function DbgContinueIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#89d185" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M14.578 7.149L7.578 2.186C7.397 2.058 7.198 2 7.003 2C6.484 2 6 2.411 6 3.002V13.003C6 13.594 6.485 14.005 7.004 14.005C7.201 14.005 7.403 13.946 7.585 13.815L14.585 8.777C15.142 8.376 15.139 7.546 14.579 7.15L14.578 7.149ZM7.5 12.027V3.969L13.14 7.968L7.5 12.027ZM3.5 2.75V13.25C3.5 13.664 3.164 14 2.75 14C2.336 14 2 13.664 2 13.25V2.75C2 2.336 2.336 2 2.75 2C3.164 2 3.5 2.336 3.5 2.75Z"/>
    </svg>
  );
}

export function DbgStepOverIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#75beff" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M9.99993 13C9.99993 14.103 9.10293 15 7.99993 15C6.89693 15 5.99993 14.103 5.99993 13C5.99993 11.897 6.89693 11 7.99993 11C9.10293 11 9.99993 11.897 9.99993 13ZM13.2499 2C12.8359 2 12.4999 2.336 12.4999 2.75V4.027C11.3829 2.759 9.75993 2 7.99993 2C5.03293 2 2.47993 4.211 2.06093 7.144C2.00193 7.554 2.28793 7.934 2.69793 7.993C2.73393 7.999 2.76993 8.001 2.80493 8.001C3.17193 8.001 3.49293 7.731 3.54693 7.357C3.86093 5.159 5.77593 3.501 8.00093 3.501C9.52993 3.501 10.9199 4.264 11.7439 5.501H9.75093C9.33693 5.501 9.00093 5.837 9.00093 6.251C9.00093 6.665 9.33693 7.001 9.75093 7.001H13.2509C13.6649 7.001 14.0009 6.665 14.0009 6.251V2.751C14.0009 2.337 13.6649 2.001 13.2509 2.001L13.2499 2Z"/>
    </svg>
  );
}

export function DbgStepIntoIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#75beff" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M10 13C10 14.103 9.10304 15 8.00004 15C6.89704 15 6.00004 14.103 6.00004 13C6.00004 11.897 6.89704 11 8.00004 11C9.10304 11 10 11.897 10 13ZM12.03 5.22C11.737 4.927 11.262 4.927 10.969 5.22L8.74904 7.44V1.75C8.74904 1.336 8.41304 1 7.99904 1C7.58504 1 7.24904 1.336 7.24904 1.75V7.439L5.02904 5.219C4.73604 4.926 4.26104 4.926 3.96804 5.219C3.67504 5.512 3.67504 5.987 3.96804 6.28L7.46804 9.78C7.61404 9.926 7.80604 10 7.99804 10C8.19004 10 8.38204 9.927 8.52804 9.78L12.028 6.28C12.321 5.987 12.321 5.512 12.028 5.219L12.03 5.22Z"/>
    </svg>
  );
}

export function DbgStepOutIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#75beff" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M9.99802 13C9.99802 14.103 9.10102 15 7.99802 15C6.89502 15 5.99802 14.103 5.99802 13C5.99802 11.897 6.89502 11 7.99802 11C9.10102 11 9.99802 11.897 9.99802 13ZM12.03 4.71999L8.53002 1.21999C8.23702 0.926994 7.76202 0.926994 7.46902 1.21999L3.96902 4.71999C3.67602 5.01299 3.67602 5.48799 3.96902 5.78099C4.26202 6.07399 4.73702 6.07399 5.03002 5.78099L7.25002 3.56099V9.24999C7.25002 9.66399 7.58602 9.99999 8.00002 9.99999C8.41402 9.99999 8.75002 9.66399 8.75002 9.24999V3.56099L10.97 5.78099C11.116 5.92699 11.308 6.00099 11.5 6.00099C11.692 6.00099 11.884 5.92799 12.03 5.78099C12.323 5.48799 12.323 5.01299 12.03 4.71999Z"/>
    </svg>
  );
}

export function DbgRestartIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#89d185" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M14 8C14 8.81 13.842 9.596 13.528 10.336C13.224 11.053 12.791 11.694 12.241 12.243C11.694 12.791 11.053 13.224 10.337 13.528C9.59602 13.841 8.81002 14 8.00002 14C7.19002 14 6.40402 13.842 5.66402 13.528C4.94702 13.224 4.30602 12.791 3.75702 12.242C3.20802 11.693 2.77602 11.053 2.47202 10.337C2.31002 9.956 2.48802 9.516 2.86902 9.354C3.25102 9.19 3.69002 9.37 3.85202 9.751C4.08102 10.288 4.40502 10.77 4.81802 11.181C5.23002 11.595 5.71202 11.919 6.24902 12.148C7.35602 12.615 8.64302 12.615 9.75202 12.148C10.288 11.919 10.77 11.595 11.181 11.183C11.595 10.77 11.919 10.288 12.148 9.751C12.381 9.197 12.501 8.608 12.501 8C12.501 7.392 12.382 6.803 12.148 6.248C11.919 5.712 11.595 5.23 11.182 4.819C10.77 4.405 10.288 4.081 9.75102 3.852C8.64402 3.385 7.35702 3.385 6.24802 3.852C5.71202 4.081 5.23002 4.405 4.81902 4.817C4.60802 5.027 4.42002 5.256 4.25702 5.5H6.24902C6.66302 5.5 6.99902 5.836 6.99902 6.25C6.99902 6.664 6.66302 7 6.24902 7H2.74902C2.33502 7 1.99902 6.664 1.99902 6.25V2.75C1.99902 2.336 2.33502 2 2.74902 2C3.16302 2 3.49902 2.336 3.49902 2.75V4.032C3.58202 3.938 3.66802 3.845 3.75802 3.757C4.30502 3.209 4.94602 2.776 5.66202 2.472C7.14402 1.845 8.85402 1.845 10.335 2.472C11.052 2.776 11.693 3.209 12.242 3.758C12.791 4.307 13.223 4.947 13.527 5.663C13.84 6.404 13.999 7.19 13.999 8H14Z"/>
    </svg>
  );
}

/** VS Code codicon: debug-restart-frame */
export function RestartFrameIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#89d185" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M1 3.5C1 3.22386 1.22386 3 1.5 3H14.5C14.7761 3 15 3.22386 15 3.5C15 3.77614 14.7761 4 14.5 4H1.5C1.22386 4 1 3.77614 1 3.5Z"/>
      <path d="M1 7.5C1 7.22386 1.22386 7 1.5 7H14.5C14.7761 7 15 7.22386 15 7.5C15 7.77614 14.7761 8 14.5 8H1.5C1.22386 8 1 7.77614 1 7.5Z"/>
      <path d="M1 11.5C1 11.2239 1.22386 11 1.5 11H7.99939V11.4994C7.99939 11.6716 8.02899 11.8407 8.08538 12H1.5C1.22386 12 1 11.7761 1 11.5Z"/>
      <path d="M8.99939 9.49939V11.4994C8.99939 11.632 9.05207 11.7592 9.14584 11.8529C9.2396 11.9467 9.36678 11.9994 9.49939 11.9994H11.4994C11.632 11.9994 11.7592 11.9467 11.8529 11.8529C11.9467 11.7592 11.9994 11.632 11.9994 11.4994C11.9994 11.3668 11.9467 11.2396 11.8529 11.1458C11.7592 11.0521 11.632 10.9994 11.4994 10.9994H10.4994C10.5702 10.9049 10.6477 10.8157 10.7314 10.7324C11.2078 10.2778 11.8409 10.0242 12.4994 10.0242C13.1579 10.0242 13.791 10.2778 14.2674 10.7324C14.4996 10.9645 14.6838 11.2402 14.8095 11.5435C14.9352 11.8469 14.9999 12.172 14.9999 12.5004C14.9999 12.8287 14.9352 13.1539 14.8095 13.4573C14.6838 13.7606 14.4996 14.0362 14.2674 14.2684C13.7909 14.7227 13.1578 14.9762 12.4994 14.9762C11.841 14.9762 11.2079 14.7227 10.7314 14.2684C10.6371 14.1773 10.5108 14.1269 10.3797 14.1281C10.2486 14.1292 10.1232 14.1818 10.0305 14.2745C9.93778 14.3672 9.88519 14.4926 9.88405 14.6237C9.88291 14.7548 9.93331 14.8811 10.0244 14.9754C10.6808 15.6318 11.5711 16.0006 12.4994 16.0006C13.4277 16.0006 14.318 15.6318 14.9744 14.9754C15.6308 14.319 15.9996 13.4287 15.9996 12.5004C15.9996 11.5721 15.6308 10.6818 14.9744 10.0254C14.3075 9.38902 13.4212 9.03396 12.4994 9.03396C11.5776 9.03396 10.6912 9.38902 10.0244 10.0254L9.99939 10.0514V9.49939C9.99939 9.36678 9.94671 9.2396 9.85294 9.14584C9.75918 9.05207 9.632 8.99939 9.49939 8.99939C9.36678 8.99939 9.2396 9.05207 9.14584 9.14584C9.05207 9.2396 8.99939 9.36678 8.99939 9.49939Z"/>
    </svg>
  );
}

export function DbgStopIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="#f48771" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d="M12.5 3.5V12.5H3.5V3.5H12.5ZM12.5 2H3.5C2.672 2 2 2.672 2 3.5V12.5C2 13.328 2.672 14 3.5 14H12.5C13.328 14 14 13.328 14 12.5V3.5C14 2.672 13.328 2 12.5 2Z"/>
    </svg>
  );
}

export function MuteBreakpointsIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" {...rest}>
      <circle cx="8" cy="8" r="5" fill="currentColor" opacity="0.3" />
      <line x1="3" y1="13" x2="13" y2="3" strokeWidth="1.5" />
    </svg>
  );
}

export function RunDebugIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path fill="#89d185" d="M19.854 13.9605L13.2105 17.697C12.954 17.22 12.5505 16.8345 12.039 16.641L12.054 16.626L19.1175 12.6525C19.6275 12.366 19.6275 11.6325 19.1175 11.3445L7.11751 4.59599C6.61801 4.31399 6.00001 4.67549 6.00001 5.24999V10.5C5.46901 10.5 4.97401 10.6215 4.50001 10.791V5.24999C4.50001 3.52949 6.35251 2.44499 7.85251 3.28949L19.8525 10.0395C21.381 10.899 21.381 13.101 19.8525 13.962L19.854 13.9605Z"/>
      <path fill="#e06c75" d="M10.5 16.0605V18H11.25C11.664 18 12 18.336 12 18.75C12 19.164 11.664 19.5 11.25 19.5H10.5C10.5 20.076 10.3905 20.625 10.1925 21.132L11.781 22.7205C12.0735 23.013 12.0735 23.4885 11.781 23.781C11.634 23.928 11.442 24 11.25 24C11.058 24 10.866 23.9265 10.719 23.781L9.39151 22.4535C8.56651 23.4 7.35151 24.0015 6.00001 24.0015C4.64851 24.0015 3.43351 23.4015 2.60851 22.4535L1.28101 23.781C1.13401 23.928 0.942009 24 0.750009 24C0.558009 24 0.366009 23.9265 0.219009 23.781C-0.0734912 23.4885 -0.0734912 23.013 0.219009 22.7205L1.80751 21.132C1.60951 20.625 1.50001 20.076 1.50001 19.5H0.750009C0.336009 19.5 8.78423e-06 19.164 8.78423e-06 18.75C8.78423e-06 18.336 0.336009 18 0.750009 18H1.50001V16.0605L0.219009 14.7795C-0.0734912 14.487 -0.0734912 14.0115 0.219009 13.719C0.511509 13.4265 0.987009 13.4265 1.27951 13.719L2.56051 15H3.00001C3.00001 13.3455 4.34551 12 6.00001 12C7.65451 12 9.00001 13.3455 9.00001 15H9.43951L10.7205 13.719C11.013 13.4265 11.4885 13.4265 11.781 13.719C12.0735 14.0115 12.0735 14.487 11.781 14.7795L10.5 16.0605ZM4.50001 15H7.50001C7.50001 14.172 6.82801 13.5 6.00001 13.5C5.17201 13.5 4.50001 14.172 4.50001 15ZM9.00001 16.5H3.00001V19.5C3.00001 21.1545 4.34551 22.5 6.00001 22.5C7.65451 22.5 9.00001 21.1545 9.00001 19.5V16.5Z"/>
    </svg>
  );
}

// ─── gRPC Icon (Official gRPC logo arrow/connector) ─────────────────────────
export function GrpcIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.12" />
      <path
        d="M6.5 8.5L4 11l2.5 2.5 2.1-.01-2.2-2.19L17.3 11.27l-.95.96 1.05-.01 1.23-1.24-1.24-1.23-1.05.01 1 .96-10.9.04 2.18-2.2L6.5 8.5z"
        fill="currentColor"
        transform="translate(0, 1) scale(1.1)"
      />
    </svg>
  );
}

// ─── gRPC Stream Type Icons ─────────────────────────────────────────────────

/**
 * Unary RPC — single request, single response.
 * One arrow up + one arrow down.
 */
export function GrpcUnaryIcon(props: IconProps) {
  const { size = 14, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      {/* Single up arrow */}
      <path d="M5 13V3M3 5l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Single down arrow */}
      <path d="M11 3v10M9 11l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Server Streaming RPC — single request, stream of responses.
 * One full arrow up + one arrow down with double chevron head.
 */
export function GrpcServerStreamIcon(props: IconProps) {
  const { size = 14, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      {/* Single up arrow */}
      <path d="M4 13V3M2 5l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Down arrow with tail + double chevron head (spaced) */}
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 8.5l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Client Streaming RPC — stream of requests, single response.
 * One arrow up with double chevron head + one full arrow down.
 */
export function GrpcClientStreamIcon(props: IconProps) {
  const { size = 14, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      {/* Up arrow with tail + double chevron head (spaced) */}
      <path d="M4 13V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 7.5l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 4l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Single down arrow */}
      <path d="M12 3v10M10 11l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Bidirectional Streaming RPC — stream in both directions.
 * Up arrow with double chevron + down arrow with double chevron.
 */
export function GrpcBidiStreamIcon(props: IconProps) {
  const { size = 14, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      {/* Up arrow with tail + double chevron head (spaced) */}
      <path d="M4 13V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 7.5l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 4l2-2 2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Down arrow with tail + double chevron head (spaced) */}
      <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 8.5l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12l2 2 2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── SOAP Protocol Icon ─────────────────────────────────────────────────────

/**
 * SOAP icon — a bar of soap shape with "S" letter.
 * Round peach background with concave soap bar silhouette.
 */
export function SoapIcon(props: IconProps) {
  const { size = 16, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      {/* Circular peach background */}
      <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.12" />
      {/* Soap bar shape (concave sides like a real bar of soap) */}
      <path
        d="M5 10.5C5 9.2 5.8 8.2 7 8c1-.2 3.5-.5 5-.5s4 .3 5 .5c1.2.2 2 1.2 2 2.5v3c0 1.3-.8 2.3-2 2.5-1 .2-3.5.5-5 .5s-4-.3-5-.5c-1.2-.2-2-1.2-2-2.5v-3z"
        fill="currentColor"
        opacity="0.25"
      />
      {/* Bold "S" letter centered */}
      <text
        x="12"
        y="13.2"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="7.5"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="currentColor"
      >
        S
      </text>
    </svg>
  );
}

// ─── Protocol Badge Icons (rich circular icons with dark/light theme support) ─

/**
 * REST protocol badge — circular icon with arrows and "REST" text.
 * Uses CSS variable for accent color to match protocol theme.
 */
export function ProtocolRestBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-rest)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g fill="none" stroke={accent} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
        <path d="M108 155 L404 155" />
        <path d="M362 123 L404 155" />
        <path d="M404 345 L108 345" />
        <path d="M150 377 L108 345" />
      </g>
      <text x="256" y="288" textAnchor="middle" fontFamily="Futura, 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight="800" fontSize="105" fill={accent} letterSpacing="4">REST</text>
    </svg>
  );
}

/**
 * GraphQL protocol badge — circular icon with GraphQL atom/molecule shape.
 */
export function ProtocolGraphQLBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-graphql)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g transform="translate(116 116) scale(9.33)" fill={accent}>
        <path d="M4.08 22.864l-1.1-.636L15.248.98l1.1.636z" />
        <path d="M2.727 20.53h24.538v1.272H2.727z" />
        <path d="M15.486 28.332L3.213 21.246l.636-1.1 12.273 7.086zm10.662-18.47L13.874 2.777l.636-1.1 12.273 7.086z" />
        <path d="M3.852 9.858l-.636-1.1L15.5 1.67l.636 1.1z" />
        <path d="M25.922 22.864l-12.27-21.25 1.1-.636 12.27 21.25zM3.7 7.914h1.272v14.172H3.7zm21.328 0H26.3v14.172h-1.272z" />
        <path d="M15.27 27.793l-.555-.962 10.675-6.163.555.962z" />
        <path d="M27.985 22.5a2.68 2.68 0 0 1-3.654.981 2.68 2.68 0 0 1-.981-3.654 2.68 2.68 0 0 1 3.654-.981c1.287.743 1.724 2.375.98 3.654M6.642 10.174a2.68 2.68 0 0 1-3.654.981A2.68 2.68 0 0 1 2.007 7.5a2.68 2.68 0 0 1 3.654-.981 2.68 2.68 0 0 1 .981 3.654M2.015 22.5a2.68 2.68 0 0 1 .981-3.654 2.68 2.68 0 0 1 3.654.981 2.68 2.68 0 0 1-.981 3.654c-1.287.735-2.92.3-3.654-.98m21.343-12.326a2.68 2.68 0 0 1 .981-3.654 2.68 2.68 0 0 1 3.654.981 2.68 2.68 0 0 1-.981 3.654 2.68 2.68 0 0 1-3.654-.981M15 30a2.674 2.674 0 1 1 2.674-2.673A2.68 2.68 0 0 1 15 30m0-24.652a2.67 2.67 0 0 1-2.674-2.674 2.67 2.67 0 1 1 5.347 0A2.67 2.67 0 0 1 15 5.347" />
      </g>
    </svg>
  );
}

/**
 * Realtime/WebSocket protocol badge — circular icon with clock and streaming arrows.
 */
export function ProtocolRealtimeBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-websocket)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round">
        {/* Clock face */}
        <circle cx="256" cy="256" r="92" strokeWidth="14" />
        {/* 12 tick marks */}
        <g strokeWidth="8">
          <line x1="256" y1="178" x2="256" y2="192" />
          <line x1="295" y1="188.5" x2="288" y2="200.6" />
          <line x1="323.5" y1="217" x2="311.4" y2="224" />
          <line x1="334" y1="256" x2="320" y2="256" />
          <line x1="323.5" y1="295" x2="311.4" y2="288" />
          <line x1="295" y1="323.5" x2="288" y2="311.4" />
          <line x1="256" y1="334" x2="256" y2="320" />
          <line x1="217" y1="323.5" x2="224" y2="311.4" />
          <line x1="188.5" y1="295" x2="200.6" y2="288" />
          <line x1="178" y1="256" x2="192" y2="256" />
          <line x1="188.5" y1="217" x2="200.6" y2="224" />
          <line x1="217" y1="188.5" x2="224" y2="200.6" />
        </g>
        {/* Clock hands */}
        <line x1="256" y1="256" x2="228.5" y2="208.4" strokeWidth="12" />
        <line x1="256" y1="256" x2="275" y2="223" strokeWidth="12" />
        {/* Center dot */}
        <circle cx="256" cy="256" r="7" fill={accent} stroke="none" />
        {/* Outer top arc (solid) */}
        <path d="M 96 256 A 160 160 0 0 1 416 256" strokeWidth="16" />
        {/* Arrowhead at right end */}
        <path d="M 402 252 L 416 278 L 430 252" strokeWidth="16" />
        {/* Outer bottom arc (dashed) */}
        <path d="M 416 256 A 160 160 0 0 1 96 256" strokeWidth="16" strokeDasharray="22 22" />
        {/* Arrowhead at left end */}
        <path d="M 82 260 L 96 234 L 110 260" strokeWidth="16" />
      </g>
    </svg>
  );
}

/**
 * gRPC protocol badge — circular icon with arrow and "g" text.
 */
export function ProtocolGrpcBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-grpc)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g transform="translate(30.6 64.85) scale(4.9)">
        <polygon
          fill={accent}
          stroke={accent}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points="23.0104694,11.6978798 11.2639265,23.5324173 23.0981483,35.2791634 33.1096115,35.2420006 22.6113586,24.8274956 74.4533539,24.6351719 69.909668,29.2099323 74.9154282,29.1913223 80.7888184,23.274168 74.8718109,17.4009247 69.8660812,17.4195061 74.4437408,21.9606667 22.601862,22.1528721 33.0221939,11.6609182"
        />
      </g>
      <text x="256" y="385" textAnchor="middle" fontFamily="Futura, 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight="800" fontSize="280" fill={accent}>g</text>
    </svg>
  );
}

/**
 * SOAP protocol badge — circular icon with arrows and "SOAP" text.
 */
export function ProtocolSoapBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-soap)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g fill="none" stroke={accent} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
        <path d="M108 155 L404 155" />
        <path d="M362 123 L404 155" />
        <path d="M404 345 L108 345" />
        <path d="M150 377 L108 345" />
      </g>
      <text x="256" y="288" textAnchor="middle" fontFamily="Futura, 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight="800" fontSize="95" fill={accent} letterSpacing="2">SOAP</text>
    </svg>
  );
}

/**
 * AI protocol badge — circular icon with chip/processor and "AI" text.
 */
export function ProtocolAiBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-ai)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g transform="translate(256 256) scale(0.9) translate(-256 -256)">
        <g fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
          <rect x="156" y="156" width="200" height="200" rx="26" ry="26" />
          <line x1="196" y1="156" x2="196" y2="112" />
          <line x1="232" y1="156" x2="232" y2="112" />
          <line x1="280" y1="156" x2="280" y2="112" />
          <line x1="316" y1="156" x2="316" y2="112" />
          <line x1="196" y1="356" x2="196" y2="400" />
          <line x1="232" y1="356" x2="232" y2="400" />
          <line x1="280" y1="356" x2="280" y2="400" />
          <line x1="316" y1="356" x2="316" y2="400" />
          <line x1="156" y1="196" x2="112" y2="196" />
          <line x1="156" y1="232" x2="112" y2="232" />
          <line x1="156" y1="280" x2="112" y2="280" />
          <line x1="156" y1="316" x2="112" y2="316" />
          <line x1="356" y1="196" x2="400" y2="196" />
          <line x1="356" y1="232" x2="400" y2="232" />
          <line x1="356" y1="280" x2="400" y2="280" />
          <line x1="356" y1="316" x2="400" y2="316" />
        </g>
        <g fill={accent}>
          <circle cx="196" cy="105" r="8" />
          <circle cx="232" cy="105" r="8" />
          <circle cx="280" cy="105" r="8" />
          <circle cx="316" cy="105" r="8" />
          <circle cx="196" cy="407" r="8" />
          <circle cx="232" cy="407" r="8" />
          <circle cx="280" cy="407" r="8" />
          <circle cx="316" cy="407" r="8" />
          <circle cx="105" cy="196" r="8" />
          <circle cx="105" cy="232" r="8" />
          <circle cx="105" cy="280" r="8" />
          <circle cx="105" cy="316" r="8" />
          <circle cx="407" cy="196" r="8" />
          <circle cx="407" cy="232" r="8" />
          <circle cx="407" cy="280" r="8" />
          <circle cx="407" cy="316" r="8" />
        </g>
        <text x="256" y="296" textAnchor="middle" fontFamily="Futura, 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif" fontWeight="800" fontSize="120" fill={accent} letterSpacing="4">AI</text>
      </g>
    </svg>
  );
}

/**
 * MCP protocol badge — circular icon with MCP connector paths.
 */
export function ProtocolMcpBadge(props: IconProps) {
  const { size = 24, ...rest } = props;
  const accent = 'var(--color-protocol-mcp)';

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" {...rest}>
      <g transform="translate(76 76) scale(2)" fill="none" stroke={accent} strokeWidth="12" strokeLinecap="round">
        <path d="M18 84.8528L85.8822 16.9706C95.2548 7.59798 110.451 7.59798 119.823 16.9706V16.9706C129.196 26.3431 129.196 41.5391 119.823 50.9117L68.5581 102.177" />
        <path d="M69.2652 101.47L119.823 50.9117C129.196 41.5391 144.392 41.5391 153.765 50.9117L154.118 51.2652C163.491 60.6378 163.491 75.8338 154.118 85.2063L92.7248 146.6C89.6006 149.724 89.6006 154.789 92.7248 157.913L105.331 170.52" />
        <path d="M102.853 33.9411L52.6482 84.1457C43.2756 93.5183 43.2756 108.714 52.6482 118.087V118.087C62.0208 127.459 77.2167 127.459 86.5893 118.087L136.794 67.8822" />
      </g>
    </svg>
  );
}

// ─── SOAP-specific utility icons ─────────────────────────────────────────────

export function LinkIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function XCircleIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function XmlTagIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="7 7 2 12 7 17" />
      <polyline points="17 7 22 12 17 17" />
      <line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  );
}

export function SchemaIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <line x1="10" y1="6.5" x2="14" y2="6.5" />
      <line x1="6.5" y1="10" x2="6.5" y2="14" />
    </svg>
  );
}

export function TypeIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  );
}

export function ExpandAllIcon(props: IconProps) {
  return (
    <svg width={props.size || 16} height={props.size || 16} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={props.className}>
      <path d="M15 6V11C15 13.21 13.21 15 11 15H6C5.26 15 4.62 14.6 4.27 14H11C12.65 14 14 12.65 14 11V4.27C14.6 4.62 15 5.26 15 6ZM11 13H4C2.897 13 2 12.103 2 11V4C2 2.897 2.897 2 4 2H11C12.103 2 13 2.897 13 4V11C13 12.103 12.103 13 11 13ZM4 12H11C11.551 12 12 11.552 12 11V4C12 3.449 11.551 3 11 3H4C3.449 3 3 3.449 3 4V11C3 11.552 3.449 12 4 12ZM9.5 7H8V5.5C8 5.224 7.776 5 7.5 5C7.224 5 7 5.224 7 5.5V7H5.5C5.224 7 5 7.224 5 7.5C5 7.776 5.224 8 5.5 8H7V9.5C7 9.776 7.224 10 7.5 10C7.776 10 8 9.776 8 9.5V8H9.5C9.776 8 10 7.776 10 7.5C10 7.224 9.776 7 9.5 7Z"/>
    </svg>
  );
}

export function CollapseAllIcon(props: IconProps) {
  return (
    <svg width={props.size || 16} height={props.size || 16} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor" className={props.className}>
      <path d="M14 4.27051C14.5999 4.62053 15 5.26009 15 6V11C15 13.21 13.21 15 11 15H6C5.26009 15 4.62053 14.5999 4.27051 14H11C12.65 14 14 12.65 14 11V4.27051Z"/>
      <path d="M9.5 7C9.776 7 10 7.224 10 7.5C10 7.776 9.776 8 9.5 8H5.5C5.224 8 5 7.776 5 7.5C5 7.224 5.224 7 5.5 7H9.5Z"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M11 2C12.103 2 13 2.897 13 4V11C13 12.103 12.103 13 11 13H4C2.897 13 2 12.103 2 11V4C2 2.897 2.897 2 4 2H11ZM4 3C3.449 3 3 3.449 3 4V11C3 11.552 3.449 12 4 12H11C11.551 12 12 11.552 12 11V4C12 3.449 11.551 3 11 3H4Z"/>
    </svg>
  );
}

/** Power plug connect icon — used for Connect buttons */
export function ConnectIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M12 2v4" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M6 6h12v4a6 6 0 0 1-6 6 6 6 0 0 1-6-6V6z" />
      <path d="M12 16v6" />
    </svg>
  );
}

/** Disconnect icon — unplug / power off style */
export function DisconnectIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M18 3l-3 3" />
      <path d="M10.5 13.5l-7 7" />
      <path d="M15 6l-6 6" />
      <path d="M6 18l3-3" />
      <path d="M21 6l-3 3" />
      <path d="M3 18l3-3" />
      <path d="M13.5 10.5l3-3" />
      <path d="M10.5 13.5l-3 3" />
    </svg>
  );
}

/** MCP Tool sparkle icon — gradient sparkle for tool listings */
export function McpToolIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props, { size: 14 })} fill="none" stroke="none">
      <path d="M14.187 8.096L15 5.25L15.813 8.096C16.072 8.965 16.535 9.758 17.163 10.408C17.792 11.059 18.567 11.547 19.424 11.833L22.25 12.75L19.424 13.667C18.567 13.953 17.792 14.441 17.163 15.092C16.535 15.742 16.072 16.535 15.813 17.404L15 20.25L14.187 17.404C13.928 16.535 13.465 15.742 12.837 15.092C12.208 14.441 11.433 13.953 10.576 13.667L7.75 12.75L10.576 11.833C11.433 11.547 12.208 11.059 12.837 10.408C13.465 9.758 13.928 8.965 14.187 8.096Z" fill="url(#mcpToolGrad)"/>
      <path d="M6 3L6.482 4.627C6.636 5.145 6.917 5.614 7.299 5.993C7.682 6.372 8.154 6.647 8.673 6.791L10.25 7.25L8.673 7.709C8.154 7.853 7.682 8.128 7.299 8.507C6.917 8.886 6.636 9.355 6.482 9.873L6 11.5L5.518 9.873C5.364 9.355 5.083 8.886 4.701 8.507C4.318 8.128 3.846 7.853 3.327 7.709L1.75 7.25L3.327 6.791C3.846 6.647 4.318 6.372 4.701 5.993C5.083 5.614 5.364 5.145 5.518 4.627L6 3Z" fill="url(#mcpToolGrad2)"/>
      <defs>
        <linearGradient id="mcpToolGrad" x1="7.75" y1="5.25" x2="22.25" y2="20.25"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#38bdf8"/></linearGradient>
        <linearGradient id="mcpToolGrad2" x1="1.75" y1="3" x2="10.25" y2="11.5"><stop offset="0%" stopColor="#c4b5fd"/><stop offset="100%" stopColor="#67e8f9"/></linearGradient>
      </defs>
    </svg>
  );
}

/** Eraser/Clear conversation icon */
export function ClearChatIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="9" y1="8" x2="15" y2="14" />
      <line x1="15" y1="8" x2="9" y2="14" />
    </svg>
  );
}
