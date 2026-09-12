/**
 * The wiki's icons, by name.
 *
 * The wiki used to mark every section, card and callout with an emoji. Emoji
 * are not ours: they render as a different picture on every platform, they
 * carry a colour we never chose, and next to the app's own line icons they
 * look like something pasted in. Daakia does not use them anywhere, and the
 * wiki is not an exception.
 *
 * So the pages name an icon — `icon="lock"` — and get the same stroked glyph
 * the app itself draws, in the colour the surrounding text is already using.
 * A name with no entry renders nothing rather than a placeholder box: a
 * missing icon should cost a section its decoration, not its heading.
 */
import type { ComponentType, SVGProps } from 'react';
import {
  AgentIcon, AttachmentIcon, BookOpenIcon, BracesIcon, BugIcon, CheckCircleIcon,
  ClipboardCompareIcon, ClockIcon, CloudIcon, CodeIcon, CollectionsFolderIcon,
  CompassIcon, ConnectIcon, CookieIcon, CopyIcon, CpuIcon, DevToolsIcon, DiceIcon,
  Dk8sIcon, DocumentIcon, DotIcon, DownloadIcon, ExportIcon, EyeIcon, FileSearchIcon,
  FileTextIcon, FilterIcon, FolderIcon, FolderOpenIcon, GaugeIcon, GitBranchIcon,
  GlobeIcon, GraphQLIcon, GrpcIcon, HelpCircleIcon, InfoCircleIcon, KeyIcon,
  KeyboardIcon, LayersIcon, LayoutGridIcon, LinkIcon, LockIcon, MQTTIcon, MailIcon, McpToolIcon,
  MemoryIcon, MockServerAgentIcon, NetworkIcon, PaletteIcon, PencilIcon, PinIcon,
  PlayIcon, ProcessIcon, RadioIcon, RadioSelectIcon, RealtimeIcon, RefreshIcon,
  RestApiIcon, SaveIcon, SchemaIcon, SearchIcon, SendIcon, ServerIcon, SettingsIcon,
  ShieldIcon, SoapIcon, SparkleIcon, StarIcon, StethoscopeIcon, StopSquareIcon,
  SunIcon, SystemIcon, TableIcon, TerminalIcon, TestAgentIcon, TimelineIcon,
  TrashIcon, TypeIcon, UploadIcon, UserPromptIcon, VariablesIcon, WandIcon,
  WarningTriangleIcon, WebSocketIcon, WifiIcon, XCircleIcon, XmlTagIcon,
} from '../../../../icons';

type Glyph = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Every name the wiki pages are allowed to ask for. */
export const WIKI_ICONS: Record<string, Glyph> = {
  agent: AgentIcon, ai: SparkleIcon, attachment: AttachmentIcon, audit: FileSearchIcon,
  book: BookOpenIcon, braces: BracesIcon, bug: BugIcon, check: CheckCircleIcon,
  clipboard: ClipboardCompareIcon, clock: ClockIcon, cloud: CloudIcon, code: CodeIcon,
  collections: CollectionsFolderIcon, compass: CompassIcon, connect: ConnectIcon,
  cookie: CookieIcon, copy: CopyIcon, cpu: CpuIcon, devtools: DevToolsIcon,
  dice: DiceIcon, dk8s: Dk8sIcon, document: DocumentIcon, dot: DotIcon,
  download: DownloadIcon, export: ExportIcon, eye: EyeIcon, file: FileTextIcon,
  filter: FilterIcon, folder: FolderIcon, folderOpen: FolderOpenIcon, gauge: GaugeIcon,
  git: GitBranchIcon, globe: GlobeIcon, graphql: GraphQLIcon, grpc: GrpcIcon,
  help: HelpCircleIcon, info: InfoCircleIcon, key: KeyIcon, keyboard: KeyboardIcon,
  layers: LayersIcon, link: LinkIcon, lock: LockIcon, mail: MailIcon, mcp: McpToolIcon,
  workspace: LayoutGridIcon,
  memory: MemoryIcon, mock: MockServerAgentIcon, mqtt: MQTTIcon, network: NetworkIcon,
  palette: PaletteIcon, pencil: PencilIcon, pin: PinIcon, play: PlayIcon,
  process: ProcessIcon, radio: RadioIcon, realtime: RealtimeIcon, refresh: RefreshIcon,
  rest: RestApiIcon, save: SaveIcon, schema: SchemaIcon, script: FileTextIcon,
  search: SearchIcon, select: RadioSelectIcon, send: SendIcon, server: ServerIcon,
  settings: SettingsIcon, shield: ShieldIcon, soap: SoapIcon, star: StarIcon,
  stethoscope: StethoscopeIcon, stop: StopSquareIcon, sun: SunIcon, system: SystemIcon,
  table: TableIcon, terminal: TerminalIcon, test: TestAgentIcon, timeline: TimelineIcon,
  trash: TrashIcon, type: TypeIcon, upload: UploadIcon, user: UserPromptIcon,
  variables: VariablesIcon, wand: WandIcon, warning: WarningTriangleIcon,
  websocket: WebSocketIcon, wifi: WifiIcon, error: XCircleIcon, xml: XmlTagIcon,
};

export type WikiIconName = keyof typeof WIKI_ICONS;

export function WikiIcon({ name, size = 15, className, style }: {
  name?: string; size?: number; className?: string; style?: React.CSSProperties;
}) {
  const Glyph = name ? WIKI_ICONS[name] : undefined;
  if (!Glyph) return null;
  return <Glyph size={size} className={className} style={style} aria-hidden="true" />;
}
