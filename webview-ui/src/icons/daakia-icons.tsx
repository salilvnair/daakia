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

/** Radio-button select icon — hollow ring = not selected, ring + center dot = selected */
export function RadioSelectIcon({ size = 16, selected = false, className, style }: { size?: number; selected?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style}>
      <circle cx="8" cy="8" r="6.5" strokeWidth="1.5" stroke="currentColor" />
      {selected && <circle cx="8" cy="8" r="3.5" fill="currentColor" />}
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

/** GitHub Copilot icon */
export function CopilotIcon(props: IconProps) {
  const { size = 16, style, className } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9.75 14.25c0 .69-.56 1.25-1.25 1.25s-1.25-.56-1.25-1.25.56-1.25 1.25-1.25 1.25.56 1.25 1.25zM16.75 13c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25S17.44 13 16.75 13zM22.5 12c0 5.799-4.701 10.5-10.5 10.5S1.5 17.799 1.5 12 6.201 1.5 12 1.5 22.5 6.201 22.5 12zm-8.048-5.26c-.444.087-.87.244-1.28.46a6.5 6.5 0 0 0-2.35 0 5.07 5.07 0 0 0-1.28-.46C7.83 6.38 6 7.7 6 9.5c0 .94.28 1.82.78 2.56.22.33.47.63.74.88.04.73.17 1.44.4 2.1.3.87.75 1.62 1.35 2.14.6.52 1.38.82 2.23.82h1.01c.85 0 1.63-.3 2.23-.82.6-.52 1.05-1.27 1.35-2.14.23-.66.36-1.37.4-2.1.27-.25.52-.55.74-.88.5-.74.78-1.62.78-2.56 0-1.8-1.83-3.12-3.57-2.76zm-.7 9.51h-.98c-.53 0-1.04-.19-1.46-.54-.42-.35-.74-.88-.98-1.56a7.5 7.5 0 0 1-.36-1.84 6.3 6.3 0 0 0 1.81.27c.66 0 1.3-.1 1.91-.27.02.64.1 1.26.27 1.84.05.15.1.3.16.43-.13.37-.37.68-.68.9-.31.22-.67.34-1.05.35l.08.02c.09.12.19.24.28.4zm3.7-3.94c-.2.29-.42.52-.65.68a7.6 7.6 0 0 1-.36 1.84c-.24.68-.56 1.21-.98 1.56-.42.35-.93.54-1.46.54h-.04a2.04 2.04 0 0 0 .36-.35c.28-.38.46-.84.54-1.3a6.3 6.3 0 0 0 1.91.27c.65 0 1.28-.1 1.87-.27a7.54 7.54 0 0 1-.36-1.84c-.24-.16-.46-.39-.65-.68-.33-.49-.52-1.1-.52-1.81 0-.52.1-1.01.28-1.45.55.23 1.03.59 1.38 1.06.35.47.55 1.04.55 1.63 0 .71-.19 1.32-.52 1.81zm-9.18-1.81c0-.59.2-1.16.55-1.63.35-.47.83-.83 1.38-1.06.18.44.28.93.28 1.45 0 .71-.19 1.32-.52 1.81-.19.28-.41.52-.65.68a7.6 7.6 0 0 1-.52-1.25z"/>
    </svg>
  );
}

/**
 * GitHub Copilot branded provider icon — official Copilot logo
 * with white rounded-rect background (matches dmcr_copilot CopilotProviderIcon).
 */
export function CopilotBrandIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="white" />
      <path
        d="M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zM7.635 5.087c-1.05.102-1.935.438-2.385.906-.975 1.037-.765 3.668-.21 4.224.405.394 1.17.657 1.995.657h.09c.649-.013 1.785-.176 2.73-1.11.435-.41.705-1.433.675-2.47-.03-.834-.27-1.52-.63-1.813-.39-.336-1.275-.482-2.265-.394zm6.465.394c-.36.292-.6.98-.63 1.813-.03 1.037.24 2.06.675 2.47.968.957 2.136 1.104 2.776 1.11h.044c.825 0 1.59-.263 1.995-.657.555-.556.765-3.187-.21-4.224-.45-.468-1.335-.804-2.385-.906-.99-.088-1.875.058-2.265.394zM12 7.615c-.24 0-.525.015-.84.044.03.16.045.336.06.526l-.001.159a2.94 2.94 0 01-.014.25c.225-.022.425-.027.612-.028h.366c.187 0 .387.006.612.028-.015-.146-.015-.277-.015-.409.015-.19.03-.365.06-.526a9.29 9.29 0 00-.84-.044z"
        fill="#18181b"
      />
    </svg>
  );
}

// ─── AI Provider Brand Icons ──────────────────────────────────────────────────
// One icon per provider. Each accepts { size?: number }.
// All SVG paths sourced from official provider brand assets.
// currentColor icons use a dark bg + white path; pre-colored icons use white bg.

/** OpenAI provider brand icon — white logo on brand green (#10a37f) */
export function OpenAiProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#10a37f" />
      <path fillRule="evenodd" fill="white"
        d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"
      />
    </svg>
  );
}

/** Anthropic/Claude provider brand icon — orange Claude logo on white background */
export function AnthropicProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="white" />
      <path fillRule="nonzero" fill="#D97757"
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      />
    </svg>
  );
}

/** Google Gemini provider brand icon — four-pointed star with multicolor gradients on white */
export function GeminiProviderIcon({ size = 22 }: { size?: number }) {
  const star = 'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="white" />
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-gem-g0" x1="7" x2="11" y1="15.5" y2="12">
          <stop stopColor="#08B962" /><stop offset="1" stopColor="#08B962" stopOpacity={0} />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-gem-g1" x1="8" x2="11.5" y1="5.5" y2="11">
          <stop stopColor="#F94543" /><stop offset="1" stopColor="#F94543" stopOpacity={0} />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-gem-g2" x1="3.5" x2="17.5" y1="13.5" y2="12">
          <stop stopColor="#FABC12" /><stop offset=".46" stopColor="#FABC12" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={star} fill="#3186FF" />
      <path d={star} fill="url(#daakia-gem-g0)" />
      <path d={star} fill="url(#daakia-gem-g1)" />
      <path d={star} fill="url(#daakia-gem-g2)" />
    </svg>
  );
}

/** DeepSeek provider brand icon — blue DeepSeek logo on white background */
export function DeepSeekProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="white" />
      <path fill="#4D6BFE"
        d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"
      />
    </svg>
  );
}

/** xAI Grok provider brand icon — white Grok logo on near-black background */
export function GrokProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#18181b" />
      <path fillRule="evenodd" fill="white"
        d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"
      />
    </svg>
  );
}

/** Groq provider brand icon — white Groq "G" logo on near-black background */
export function GroqProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#18181b" />
      <path fillRule="evenodd" fill="white"
        d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z"
      />
    </svg>
  );
}

/** Together AI provider brand icon — pink/purple/orange triskelion on dark background */
export function TogetherProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#0D0D0D" />
      <path d="M23.197 4.503A6 6 0 0015 2.307a5.973 5.973 0 00-2.995 4.933l5.996.008v.515h-5.996c.039.937.298 1.87.8 2.74a6 6 0 1010.39-6z" fill="#EF2CC1" />
      <path d="M.805 4.5A6 6 0 003 12.697a5.972 5.972 0 005.77.127L5.779 7.627l.446-.257 2.997 5.192A6 6 0 10.804 4.5z" fill="#CAAEF5" />
      <path d="M12 23.894a6 6 0 005.999-6c0-2.13-1.1-3.996-2.775-5.06l-3.005 5.189-.444-.258 2.997-5.192A6 6 0 1012 23.894z" fill="#FC4C02" />
    </svg>
  );
}

/** Mistral AI provider brand icon — gold/orange/red block grid on dark background */
export function MistralProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#18181b" />
      <path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="gold" />
      <path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="#FFAF00" />
      <path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="#FF8205" />
      <path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="#FA500F" />
      <path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="#E10500" />
    </svg>
  );
}

/** Ollama provider brand icon — white llama logo on dark background */
export function OllamaProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#18181b" />
      <path fillRule="evenodd" fill="white"
        d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"
      />
    </svg>
  );
}

/** Azure OpenAI provider brand icon — gradient purple/blue logo on white background */
export function AzureOpenAiProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="white" />
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-az-g0" x1="18.242" x2="14.191" y1="16.837" y2=".616">
          <stop stopColor="#712575" /><stop offset=".09" stopColor="#9A2884" /><stop offset=".18" stopColor="#BF2C92" />
          <stop offset=".27" stopColor="#DA2E9C" /><stop offset=".34" stopColor="#EB30A2" /><stop offset=".4" stopColor="#F131A5" />
          <stop offset=".5" stopColor="#EC30A3" /><stop offset=".61" stopColor="#DF2F9E" /><stop offset=".72" stopColor="#C92D96" />
          <stop offset=".83" stopColor="#AA2A8A" /><stop offset=".95" stopColor="#83267C" /><stop offset="1" stopColor="#712575" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-az-g1" x1="19.782" x2="19.782" y1=".34" y2="23.222">
          <stop stopColor="#DA7ED0" /><stop offset=".08" stopColor="#B17BD5" /><stop offset=".19" stopColor="#8778DB" />
          <stop offset=".3" stopColor="#6276E1" /><stop offset=".41" stopColor="#4574E5" /><stop offset=".54" stopColor="#2E72E8" />
          <stop offset=".67" stopColor="#1D71EB" /><stop offset=".81" stopColor="#1471EC" /><stop offset="1" stopColor="#1171ED" />
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" id="daakia-az-g2" x1="18.404" x2="3.236" y1=".859" y2="25.183">
          <stop stopColor="#DA7ED0" /><stop offset=".05" stopColor="#B77BD4" /><stop offset=".11" stopColor="#9079DA" />
          <stop offset=".18" stopColor="#6E77DF" /><stop offset=".25" stopColor="#5175E3" /><stop offset=".33" stopColor="#3973E7" />
          <stop offset=".42" stopColor="#2772E9" /><stop offset=".54" stopColor="#1A71EB" /><stop offset=".68" stopColor="#1371EC" />
          <stop offset="1" stopColor="#1171ED" />
        </linearGradient>
      </defs>
      <path clipRule="evenodd" fillRule="evenodd" fill="url(#daakia-az-g0)"
        d="M16.233 0c.713 0 1.345.551 1.572 1.329.227.778 1.555 5.59 1.555 5.59v9.562h-4.813L14.645 0h1.588z" />
      <path fill="url(#daakia-az-g1)"
        d="M23.298 7.47c0-.34-.275-.6-.6-.6h-2.835a3.617 3.617 0 00-3.614 3.615v5.996h3.436a3.617 3.617 0 003.613-3.614V7.47z" />
      <path clipRule="evenodd" fillRule="evenodd" fill="url(#daakia-az-g2)"
        d="M16.233 0a.982.982 0 00-.989.989l-.097 18.198A4.814 4.814 0 0110.334 24H1.6a.597.597 0 01-.567-.794l7-19.981A4.819 4.819 0 0112.57 0h3.679-.016z" />
    </svg>
  );
}

/** 🤖 Bot/Agent icon — for AI agents */
export function AgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
      <circle cx="9" cy="16" r="1" />
      <circle cx="15" cy="16" r="1" />
    </svg>
  );
}

// ─── AI Agent Scenario Icons ──────────────────────────────────────────────────

/** 🌐 REST API Agent — globe with HTTP layers */
export function RestAgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M7 8h10M7 16h10" />
    </svg>
  );
}

/** 💻 cURL Agent — terminal prompt with command line */
export function CurlAgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M8 9l4 4-4 4" />
      <path d="M16 17h2" />
    </svg>
  );
}

/** 🗄️ Mock Server Agent — layered server rack */
export function MockServerAgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <rect x="2" y="11" width="20" height="5" rx="1" />
      <circle cx="18.5" cy="6.5" r="1" />
      <circle cx="18.5" cy="13.5" r="1" />
      <path d="M6 6.5h6M6 13.5h6" />
    </svg>
  );
}

/** 🧪 Test Script Agent — beaker / test tube */
export function TestAgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M9 3h6M9 3v8.5L4 20h16l-5-8.5V3" />
      <path d="M6 17h12" />
    </svg>
  );
}

/** 📚 Knowledge Agent — open book */
export function KnowledgeAgentIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/** 💬 General Assistant — chat bubble with sparkle dot */
export function GeneralAssistantIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** DiceIcon — cube die representing random data generation */
export function DiceIcon(props: IconProps) {
  return (
    <svg {...withDefaults(props)}>
      <rect x="2" y="2" width="20" height="20" rx="3" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** DaakiaAI Mock provider brand icon — server rack on dark background with amber status dots */
export function DaakiaMockProviderIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5.5" fill="#1c1917" />
      {/* Top server bar */}
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" stroke="#eab308" strokeWidth="1.4" />
      {/* Mid server bar */}
      <rect x="3.5" y="11" width="17" height="4.5" rx="1.5" stroke="#eab308" strokeWidth="1.4" opacity="0.7" />
      {/* Status dots — green/amber */}
      <circle cx="18.5" cy="6.75" r="1.3" fill="#eab308" />
      <circle cx="18.5" cy="13.25" r="1.3" fill="#eab308" opacity="0.7" />
      {/* Server labels (horizontal bars on each rack) */}
      <rect x="5.5" y="6" width="7" height="1.5" rx="0.75" fill="#eab308" opacity="0.45" />
      <rect x="5.5" y="12.5" width="7" height="1.5" rx="0.75" fill="#eab308" opacity="0.3" />
      {/* Bottom accent strip */}
      <rect x="3.5" y="17.5" width="17" height="2" rx="1" fill="#eab308" opacity="0.2" />
    </svg>
  );
}
