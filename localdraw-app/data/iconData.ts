/**
 * Icon registry for the LocalDraw icon picker.
 *
 * General icons  → Lucide (stroke-based, 24 × 24)
 * Tech/Cloud logos → simple-icons (fill-based, 24 × 24)
 */

import { icons } from "lucide";
import {
  siAnsible,
  siApachekafka,
  siAngular,
  siAlpinelinux,
  siApache,
  siArgo,
  siCircleci,
  siCloudflare,
  siCloudflarepages,
  siCloudflareworkers,
  siDebian,
  siDeno,
  siDigitalocean,
  siDocker,
  siElasticsearch,
  siFigma,
  siGithub,
  siGithubactions,
  siGitlab,
  siGo,
  siGooglecloud,
  siGooglecloudstorage,
  siGrafana,
  siGraphql,
  siHelm,
  siJenkins,
  siJavascript,
  siKubernetes,
  siLinux,
  siMongodb,
  siMysql,
  siNetlify,
  siNextcloud,
  siNextdotjs,
  siNginx,
  siNodedotjs,
  siNpm,
  siPostgresql,
  siPostman,
  siPrometheus,
  siPython,
  siRabbitmq,
  siReact,
  siRedis,
  siRust,
  siSqlite,
  siSvelte,
  siTerraform,
  siTravisci,
  siTypescript,
  siUbuntu,
  siVercel,
  siVite,
  siVuedotjs,
  siWebpack,
  siYarn,
} from "simple-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IconCategory = "general" | "tech" | "cloud";
export type IconRenderType = "stroke" | "fill";

export interface IconEntry {
  id: string;
  name: string;
  keywords: string[];
  category: IconCategory;
  subcategory: string;
  renderType: IconRenderType;
  /** Brand hex (e.g. "#2496ED") — used as default color for fill icons */
  brandColor?: string;
  /** SVG child nodes for stroke (Lucide) icons */
  nodes?: [string, Record<string, string | number>][];
  /** Path `d` attribute for fill (simple-icons) icons */
  siPath?: string;
  viewBox: string;
}

// ─── SVG builder ─────────────────────────────────────────────────────────────

export function buildIconSVG(
  icon: IconEntry,
  color: string,
  strokeWidth = 2,
): string {
  if (icon.renderType === "stroke") {
    if (icon.nodes?.length) {
      const inner = icon.nodes
        .map(([tag, attrs]) => {
          const attrStr = Object.entries(attrs)
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ");
          return `<${tag} ${attrStr}/>`;
        })
        .join("");
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="24" height="24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" data-localdraw-icon-id="${icon.id}">${inner}</svg>`;
    }
    // Defensive fallback so one bad icon definition never breaks rendering.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="24" height="24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" data-localdraw-icon-id="${icon.id}"><circle cx="12" cy="12" r="8"/><line x1="8" y1="8" x2="16" y2="16"/></svg>`;
  }
  if (!icon.siPath) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="24" height="24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" data-localdraw-icon-id="${icon.id}"><circle cx="12" cy="12" r="8"/><line x1="8" y1="8" x2="16" y2="16"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="24" height="24" fill="${color}" data-localdraw-icon-id="${icon.id}"><path d="${icon.siPath}"/></svg>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type LucideNodes = [string, Record<string, string | number>][];

function L(
  id: string,
  name: string,
  lucideName: string,
  sub: string,
  kw: string[],
): IconEntry {
  return {
    id,
    name,
    keywords: [name.toLowerCase(), ...kw],
    category: "general",
    subcategory: sub,
    renderType: "stroke",
    nodes: (icons as Record<string, LucideNodes>)[lucideName],
    viewBox: "0 0 24 24",
  };
}

function LC(
  id: string,
  name: string,
  lucideName: string,
  sub: string,
  cat: IconCategory,
  kw: string[],
): IconEntry {
  return {
    id,
    name,
    keywords: [name.toLowerCase(), ...kw],
    category: cat,
    subcategory: sub,
    renderType: "stroke",
    nodes: (icons as Record<string, LucideNodes>)[lucideName],
    viewBox: "0 0 24 24",
  };
}

function SI(
  id: string,
  name: string,
  icon: { path: string; hex: string },
  sub: string,
  cat: IconCategory,
  kw: string[],
): IconEntry {
  return {
    id,
    name,
    keywords: [name.toLowerCase(), ...kw],
    category: cat,
    subcategory: sub,
    renderType: "fill",
    brandColor: `#${icon.hex}`,
    siPath: icon.path,
    viewBox: "0 0 24 24",
  };
}

// ─── General Icons ────────────────────────────────────────────────────────────

const GENERAL_ICONS: IconEntry[] = [
  // Shapes
  L("circle", "Circle", "Circle", "shapes", ["shape", "round", "oval"]),
  L("square", "Square", "Square", "shapes", ["shape", "rect"]),
  L("triangle", "Triangle", "Triangle", "shapes", ["shape"]),
  L("star", "Star", "Star", "shapes", ["favorite", "rating"]),
  L("heart", "Heart", "Heart", "shapes", ["love", "like", "favorite"]),
  L("diamond", "Diamond", "Diamond", "shapes", ["shape", "gem"]),
  L("hexagon", "Hexagon", "Hexagon", "shapes", ["shape"]),
  L("octagon", "Octagon", "Octagon", "shapes", ["stop", "shape"]),
  L("pentagon", "Pentagon", "Pentagon", "shapes", ["shape"]),

  // Arrows & Navigation
  L("arrow-up", "Arrow Up", "ArrowUp", "arrows", ["up", "direction"]),
  L("arrow-down", "Arrow Down", "ArrowDown", "arrows", ["down", "direction"]),
  L("arrow-left", "Arrow Left", "ArrowLeft", "arrows", ["left", "back"]),
  L("arrow-right", "Arrow Right", "ArrowRight", "arrows", ["right", "next"]),
  L("arrow-up-right", "Arrow Up Right", "ArrowUpRight", "arrows", [
    "diagonal",
    "external",
  ]),
  L("arrow-down-right", "Arrow Down Right", "ArrowDownRight", "arrows", [
    "diagonal",
  ]),
  L("arrow-up-left", "Arrow Up Left", "ArrowUpLeft", "arrows", ["diagonal"]),
  L("arrow-down-left", "Arrow Down Left", "ArrowDownLeft", "arrows", [
    "diagonal",
  ]),
  L("chevron-up", "Chevron Up", "ChevronUp", "arrows", ["up", "caret"]),
  L("chevron-down", "Chevron Down", "ChevronDown", "arrows", ["down", "caret"]),
  L("chevron-left", "Chevron Left", "ChevronLeft", "arrows", ["left", "back"]),
  L("chevron-right", "Chevron Right", "ChevronRight", "arrows", [
    "right",
    "next",
  ]),
  L("chevrons-right", "Chevrons Right", "ChevronsRight", "arrows", [
    "double",
    "forward",
  ]),
  L("chevrons-left", "Chevrons Left", "ChevronsLeft", "arrows", [
    "double",
    "back",
  ]),
  L("corner-down-right", "Corner Down Right", "CornerDownRight", "arrows", [
    "turn",
  ]),
  L("corner-up-right", "Corner Up Right", "CornerUpRight", "arrows", ["turn"]),
  L("move", "Move", "Move", "arrows", ["drag", "pan"]),
  L("move-diagonal", "Move Diagonal", "MoveDiagonal", "arrows", ["resize"]),

  // Navigation & Location
  L("home", "Home", "Home", "navigation", ["house", "main", "dashboard"]),
  L("map-pin", "Map Pin", "MapPin", "navigation", [
    "location",
    "marker",
    "geo",
    "place",
  ]),
  L("map", "Map", "Map", "navigation", ["location", "geo"]),
  L("navigation", "Navigation", "Navigation", "navigation", [
    "direction",
    "gps",
  ]),
  L("compass", "Compass", "Compass", "navigation", ["direction", "explore"]),
  L("globe", "Globe", "Globe", "navigation", [
    "world",
    "internet",
    "web",
    "earth",
  ]),
  L("globe-2", "Globe 2", "Globe2", "navigation", ["world", "internet", "web"]),

  // Actions
  L("plus", "Plus", "Plus", "actions", ["add", "create", "new"]),
  L("plus-circle", "Plus Circle", "PlusCircle", "actions", ["add", "create"]),
  L("minus", "Minus", "Minus", "actions", ["remove", "subtract"]),
  L("x", "Close", "X", "actions", ["close", "remove", "delete", "cross"]),
  L("x-circle", "X Circle", "XCircle", "actions", ["close", "error"]),
  L("check", "Check", "Check", "actions", ["done", "success", "tick"]),
  L("check-circle", "Check Circle", "CheckCircle", "actions", [
    "done",
    "success",
  ]),
  L("check-circle-2", "Check Circle 2", "CheckCircle2", "actions", [
    "done",
    "success",
  ]),
  L("refresh-cw", "Refresh", "RefreshCw", "actions", [
    "reload",
    "sync",
    "rotate",
  ]),
  L("rotate-ccw", "Rotate CCW", "RotateCcw", "actions", ["undo", "revert"]),
  L("rotate-cw", "Rotate CW", "RotateCw", "actions", ["redo", "rotate"]),
  L("download", "Download", "Download", "actions", ["save", "export"]),
  L("upload", "Upload", "Upload", "actions", ["import", "send"]),
  L("share", "Share", "Share", "actions", ["send", "export"]),
  L("share-2", "Share 2", "Share2", "actions", ["send", "social"]),
  L("copy", "Copy", "Copy", "actions", ["duplicate", "clone"]),
  L("scissors", "Scissors", "Scissors", "actions", ["cut", "trim"]),
  L("trash-2", "Trash", "Trash2", "actions", ["delete", "remove", "bin"]),
  L("edit", "Edit", "Edit", "actions", ["modify", "pen", "pencil"]),
  L("edit-3", "Edit 3", "Edit3", "actions", ["modify", "pen", "pencil"]),
  L("save", "Save", "Save", "actions", ["floppy", "store"]),
  L("undo-2", "Undo", "Undo2", "actions", ["back", "revert"]),
  L("redo-2", "Redo", "Redo2", "actions", ["forward"]),
  L("zoom-in", "Zoom In", "ZoomIn", "actions", ["magnify", "enlarge"]),
  L("zoom-out", "Zoom Out", "ZoomOut", "actions", ["magnify", "shrink"]),
  L("search", "Search", "Search", "actions", ["find", "magnify", "look"]),
  L("filter", "Filter", "Filter", "actions", ["funnel", "sort"]),
  L("more-horizontal", "More H", "MoreHorizontal", "actions", ["dots", "menu"]),
  L("more-vertical", "More V", "MoreVertical", "actions", ["dots", "menu"]),

  // Files & Storage
  L("file", "File", "File", "files", ["document", "paper"]),
  L("file-text", "File Text", "FileText", "files", ["document", "note"]),
  L("file-code", "File Code", "FileCode", "files", ["code", "script"]),
  L("folder", "Folder", "Folder", "files", ["directory", "storage"]),
  L("folder-open", "Folder Open", "FolderOpen", "files", ["directory"]),
  L("archive", "Archive", "Archive", "files", ["compress", "zip", "store"]),
  L("package", "Package", "Package", "files", ["box", "bundle", "container"]),
  L("package-2", "Package 2", "Package2", "files", ["box", "pod", "container"]),
  L("hard-drive", "Hard Drive", "HardDrive", "files", ["storage", "disk"]),
  L("database", "Database", "Database", "files", ["storage", "sql", "data"]),
  L("server", "Server", "Server", "files", ["backend", "host", "machine"]),

  // Communication
  L("mail", "Mail", "Mail", "communication", ["email", "message"]),
  L("message-circle", "Message", "MessageCircle", "communication", [
    "chat",
    "bubble",
  ]),
  L("message-square", "Message Square", "MessageSquare", "communication", [
    "chat",
    "comment",
  ]),
  L("bell", "Bell", "Bell", "communication", ["notification", "alert"]),
  L("bell-off", "Bell Off", "BellOff", "communication", ["mute", "silent"]),
  L("phone", "Phone", "Phone", "communication", ["call", "mobile"]),
  L("phone-call", "Phone Call", "PhoneCall", "communication", ["ringing"]),
  L("video", "Video", "Video", "communication", ["camera", "stream"]),
  L("video-off", "Video Off", "VideoOff", "communication", ["muted"]),
  L("mic", "Mic", "Mic", "communication", ["microphone", "audio", "voice"]),
  L("mic-off", "Mic Off", "MicOff", "communication", ["muted", "silent"]),
  L("send", "Send", "Send", "communication", ["submit", "forward"]),

  // Users & Identity
  L("user", "User", "User", "users", ["person", "profile", "account"]),
  L("users", "Users", "Users", "users", ["people", "team", "group"]),
  L("user-check", "User Check", "UserCheck", "users", ["verified", "approved"]),
  L("user-plus", "User Plus", "UserPlus", "users", ["add", "invite"]),
  L("contact", "Contact", "Contact", "users", ["address", "person"]),

  // Security & Auth
  L("shield", "Shield", "Shield", "security", ["protect", "security", "guard"]),
  L("shield-check", "Shield Check", "ShieldCheck", "security", [
    "secure",
    "verified",
  ]),
  L("lock", "Lock", "Lock", "security", ["secure", "private", "closed"]),
  L("unlock", "Unlock", "Unlock", "security", ["open", "access"]),
  L("key", "Key", "Key", "security", ["password", "access", "auth"]),
  L("eye", "Eye", "Eye", "security", ["view", "visibility", "watch"]),
  L("eye-off", "Eye Off", "EyeOff", "security", ["hidden", "private"]),
  L("fingerprint", "Fingerprint", "Fingerprint", "security", [
    "biometric",
    "identity",
  ]),

  // System & Infrastructure
  L("cloud", "Cloud", "Cloud", "system", ["storage", "aws", "azure", "gcp"]),
  L("cloud-off", "Cloud Off", "CloudOff", "system", [
    "offline",
    "disconnected",
  ]),
  L("cpu", "CPU", "Cpu", "system", ["processor", "chip", "compute"]),
  L("monitor", "Monitor", "Monitor", "system", [
    "screen",
    "desktop",
    "display",
  ]),
  L("laptop", "Laptop", "Laptop", "system", ["computer", "notebook"]),
  L("smartphone", "Phone", "Smartphone", "system", ["mobile", "device"]),
  L("tablet", "Tablet", "Tablet", "system", ["device", "ipad"]),
  L("wifi", "WiFi", "Wifi", "system", ["internet", "network", "wireless"]),
  L("wifi-off", "WiFi Off", "WifiOff", "system", ["offline", "disconnected"]),
  L("bluetooth", "Bluetooth", "Bluetooth", "system", ["wireless", "connect"]),
  L("zap", "Zap", "Zap", "system", [
    "lightning",
    "electric",
    "fast",
    "serverless",
    "lambda",
  ]),
  L("power", "Power", "Power", "system", ["on", "off", "start"]),
  L("plug", "Plug", "Plug", "system", ["connect", "power", "outlet"]),
  L("plug-zap", "Plug Zap", "PlugZap", "system", [
    "connect",
    "power",
    "electric",
  ]),
  L("network", "Network", "Network", "system", ["mesh", "topology", "connect"]),
  L("router", "Router", "Router", "system", ["network", "gateway"]),
  L("terminal", "Terminal", "Terminal", "system", [
    "cli",
    "command",
    "shell",
    "bash",
  ]),
  L("code", "Code", "Code", "system", ["developer", "programming"]),
  L("code-2", "Code 2", "Code2", "system", ["developer", "programming"]),
  L("braces", "Braces", "Braces", "system", ["json", "object", "code"]),
  L("git-branch", "Git Branch", "GitBranch", "system", ["version", "vcs"]),
  L("git-commit", "Git Commit", "GitCommit", "system", ["version", "vcs"]),
  L("git-merge", "Git Merge", "GitMerge", "system", ["version", "vcs"]),
  L("git-pull-request", "Pull Request", "GitPullRequest", "system", [
    "pr",
    "review",
  ]),
  L("bug", "Bug", "Bug", "system", ["error", "issue", "debug"]),

  // Media & Content
  L("image", "Image", "Image", "media", ["photo", "picture", "picture"]),
  L("camera", "Camera", "Camera", "media", ["photo", "capture"]),
  L("play", "Play", "Play", "media", ["video", "start", "run"]),
  L("pause", "Pause", "Pause", "media", ["stop", "hold"]),
  L("volume-2", "Volume", "Volume2", "media", ["sound", "audio"]),
  L("volume-x", "Volume Off", "VolumeX", "media", ["mute", "silent"]),
  L("music", "Music", "Music", "media", ["audio", "song"]),
  L("film", "Film", "Film", "media", ["movie", "video"]),

  // Analytics & Data
  L("bar-chart-2", "Bar Chart", "BarChart2", "analytics", ["graph", "stats"]),
  L("bar-chart-3", "Bar Chart H", "BarChart3", "analytics", ["graph", "stats"]),
  L("line-chart", "Line Chart", "LineChart", "analytics", ["graph", "trend"]),
  L("pie-chart", "Pie Chart", "PieChart", "analytics", ["graph", "breakdown"]),
  L("trending-up", "Trending Up", "TrendingUp", "analytics", [
    "growth",
    "increase",
  ]),
  L("trending-down", "Trending Down", "TrendingDown", "analytics", [
    "decline",
    "decrease",
  ]),
  L("activity", "Activity", "Activity", "analytics", [
    "pulse",
    "heartbeat",
    "monitor",
  ]),
  L("gauge", "Gauge", "Gauge", "analytics", ["speed", "meter", "performance"]),

  // Alerts & Status
  L("alert-circle", "Alert", "AlertCircle", "status", ["warning", "error"]),
  L("alert-triangle", "Warning", "AlertTriangle", "status", [
    "caution",
    "danger",
  ]),
  L("info", "Info", "Info", "status", ["help", "information"]),
  L("help-circle", "Help", "HelpCircle", "status", ["question", "support"]),

  // Time
  L("clock", "Clock", "Clock", "time", ["time", "hour", "schedule"]),
  L("calendar", "Calendar", "Calendar", "time", ["date", "schedule", "event"]),
  L("timer", "Timer", "Timer", "time", ["countdown", "stopwatch"]),
  L("hourglass", "Hourglass", "Hourglass", "time", ["wait", "loading", "time"]),
  L("alarm-clock", "Alarm", "AlarmClock", "time", ["timer", "wake"]),

  // Labels & Organization
  L("tag", "Tag", "Tag", "labels", ["label", "category"]),
  L("tags", "Tags", "Tags", "labels", ["label", "categories"]),
  L("hash", "Hash", "Hash", "labels", ["number", "id", "channel"]),
  L("bookmark", "Bookmark", "Bookmark", "labels", ["save", "favorite"]),
  L("flag", "Flag", "Flag", "labels", ["mark", "report"]),

  // Layout & UI
  L("layout-grid", "Grid", "LayoutGrid", "layout", ["layout", "grid", "tiles"]),
  L("sidebar", "Sidebar", "Sidebar", "layout", ["panel", "drawer"]),
  L("panel-left", "Panel Left", "PanelLeft", "layout", ["sidebar"]),
  L("panel-right", "Panel Right", "PanelRight", "layout", ["sidebar"]),
  L("sliders", "Sliders", "Sliders", "layout", ["settings", "controls"]),
  L("settings", "Settings", "Settings", "layout", [
    "config",
    "options",
    "gear",
  ]),
  L("settings-2", "Settings 2", "Settings2", "layout", ["config", "gear"]),
  L("menu", "Menu", "Menu", "layout", ["hamburger", "nav"]),
  L("link", "Link", "Link", "layout", ["url", "connect", "chain"]),
  L("link-2", "Link 2", "Link2", "layout", ["url", "connect"]),
  L("external-link", "External Link", "ExternalLink", "layout", [
    "open",
    "url",
    "redirect",
  ]),
  L("maximize", "Maximize", "Maximize", "layout", ["fullscreen", "expand"]),
  L("minimize", "Minimize", "Minimize", "layout", ["shrink", "collapse"]),
  L("expand", "Expand", "Expand", "layout", ["fullscreen", "enlarge"]),
  L("box", "Box", "Box", "layout", ["container", "package", "3d"]),
  L("layers", "Layers", "Layers", "layout", ["stack", "depth"]),
  L("layout-dashboard", "Dashboard", "LayoutDashboard", "layout", [
    "admin",
    "panel",
  ]),

  // Devices & Hardware
  L("cpu-frame", "Microchip", "Microchip", "devices", [
    "chip",
    "ic",
    "processor",
  ]),
  L("printer", "Printer", "Printer", "devices", ["print", "output"]),
  L("scanner", "Scanner", "Scanner", "devices", ["scan", "qr"]),
  L("keyboard", "Keyboard", "Keyboard", "devices", ["input", "type"]),
  L("mouse", "Mouse", "Mouse", "devices", ["pointer", "cursor"]),
  L("headphones", "Headphones", "Headphones", "devices", [
    "audio",
    "earphones",
  ]),
  L("speaker", "Speaker", "Speaker", "devices", ["audio", "sound"]),
  L("tv", "TV", "Tv", "devices", ["display", "screen", "television"]),
  L("watch", "Watch", "Watch", "devices", ["wearable", "time"]),
  L("battery", "Battery", "Battery", "devices", ["power", "charge"]),

  // Misc
  L("lightbulb", "Lightbulb", "Lightbulb", "misc", ["idea", "insight"]),
  L("flame", "Flame", "Flame", "misc", ["hot", "popular", "fire"]),
  L("rocket", "Rocket", "Rocket", "misc", ["launch", "deploy", "fast"]),
  L("award", "Award", "Award", "misc", ["badge", "trophy", "prize"]),
  L("trophy", "Trophy", "Trophy", "misc", ["award", "winner"]),
  L("thumbs-up", "Thumbs Up", "ThumbsUp", "misc", ["like", "approve"]),
  L("thumbs-down", "Thumbs Down", "ThumbsDown", "misc", ["dislike"]),
  L("coffee", "Coffee", "Coffee", "misc", ["break", "beverage"]),
  L("building", "Building", "Building", "misc", ["office", "company"]),
  L("building-2", "Office", "Building2", "misc", ["office", "company"]),
  L("workflow", "Workflow", "Workflow", "misc", [
    "process",
    "pipeline",
    "flow",
  ]),
  L("atom", "Atom", "Atom", "misc", ["science", "physics", "react"]),
  L("infinity", "Infinity", "Infinity", "misc", ["loop", "endless", "devops"]),
  L("recycle", "Recycle", "Recycle", "misc", ["loop", "refresh", "green"]),
  L("scan", "Scan", "Scan", "misc", ["qr", "barcode", "read"]),
  L("qr-code", "QR Code", "QrCode", "misc", ["barcode", "scan"]),
];

// ─── Tech Logos ───────────────────────────────────────────────────────────────

const TECH_ICONS: IconEntry[] = [
  // Containers & Orchestration
  SI("docker", "Docker", siDocker, "containers", "tech", [
    "container",
    "image",
    "build",
  ]),
  SI("kubernetes", "Kubernetes", siKubernetes, "containers", "tech", [
    "k8s",
    "cluster",
    "pod",
    "orchestration",
  ]),
  SI("helm", "Helm", siHelm, "containers", "tech", ["k8s", "chart", "package"]),
  SI("argocd", "Argo CD", siArgo, "containers", "tech", [
    "gitops",
    "deploy",
    "k8s",
  ]),
  SI("ansible", "Ansible", siAnsible, "containers", "tech", [
    "automation",
    "config",
  ]),
  SI("terraform", "Terraform", siTerraform, "containers", "tech", [
    "iac",
    "infra",
    "provisioning",
  ]),

  // CI/CD & DevOps
  SI("github", "GitHub", siGithub, "devops", "tech", [
    "git",
    "code",
    "vcs",
    "repo",
  ]),
  SI("gitlab", "GitLab", siGitlab, "devops", "tech", [
    "git",
    "code",
    "vcs",
    "repo",
  ]),
  SI("jenkins", "Jenkins", siJenkins, "devops", "tech", [
    "ci",
    "cd",
    "build",
    "pipeline",
  ]),
  SI("circleci", "CircleCI", siCircleci, "devops", "tech", [
    "ci",
    "cd",
    "pipeline",
  ]),
  SI("travisci", "Travis CI", siTravisci, "devops", "tech", ["ci", "cd"]),
  SI("githubactions", "GitHub Actions", siGithubactions, "devops", "tech", [
    "ci",
    "cd",
    "workflow",
  ]),
  SI("grafana", "Grafana", siGrafana, "devops", "tech", [
    "monitoring",
    "dashboard",
    "metrics",
  ]),
  SI("prometheus", "Prometheus", siPrometheus, "devops", "tech", [
    "monitoring",
    "metrics",
    "alert",
  ]),

  // Languages
  SI("javascript", "JavaScript", siJavascript, "languages", "tech", [
    "js",
    "web",
    "script",
  ]),
  SI("typescript", "TypeScript", siTypescript, "languages", "tech", [
    "ts",
    "js",
    "typed",
  ]),
  SI("python", "Python", siPython, "languages", "tech", [
    "script",
    "ml",
    "data",
  ]),
  SI("go", "Go", siGo, "languages", "tech", ["golang", "backend"]),
  SI("rust", "Rust", siRust, "languages", "tech", ["systems", "memory-safe"]),
  SI("nodejs", "Node.js", siNodedotjs, "languages", "tech", [
    "js",
    "backend",
    "runtime",
  ]),
  SI("deno", "Deno", siDeno, "languages", "tech", ["js", "runtime"]),

  // Frameworks
  SI("react", "React", siReact, "frameworks", "tech", [
    "ui",
    "frontend",
    "jsx",
  ]),
  SI("vuejs", "Vue.js", siVuedotjs, "frameworks", "tech", [
    "ui",
    "frontend",
    "js",
  ]),
  SI("angular", "Angular", siAngular, "frameworks", "tech", [
    "ui",
    "frontend",
    "spa",
  ]),
  SI("svelte", "Svelte", siSvelte, "frameworks", "tech", [
    "ui",
    "frontend",
    "compiler",
  ]),
  SI("nextjs", "Next.js", siNextdotjs, "frameworks", "tech", [
    "react",
    "ssr",
    "fullstack",
  ]),

  // Databases
  SI("postgresql", "PostgreSQL", siPostgresql, "databases", "tech", [
    "sql",
    "db",
    "relational",
  ]),
  SI("mysql", "MySQL", siMysql, "databases", "tech", [
    "sql",
    "db",
    "relational",
  ]),
  SI("mongodb", "MongoDB", siMongodb, "databases", "tech", [
    "nosql",
    "document",
    "db",
  ]),
  SI("redis", "Redis", siRedis, "databases", "tech", [
    "cache",
    "in-memory",
    "nosql",
  ]),
  SI("elasticsearch", "Elasticsearch", siElasticsearch, "databases", "tech", [
    "search",
    "index",
    "log",
  ]),
  SI("sqlite", "SQLite", siSqlite, "databases", "tech", [
    "sql",
    "embedded",
    "db",
  ]),

  // Messaging & Streaming
  SI("rabbitmq", "RabbitMQ", siRabbitmq, "messaging", "tech", [
    "queue",
    "amqp",
    "broker",
  ]),
  SI("kafka", "Apache Kafka", siApachekafka, "messaging", "tech", [
    "stream",
    "event",
    "broker",
  ]),

  // Web & API
  SI("nginx", "NGINX", siNginx, "web", "tech", [
    "web server",
    "proxy",
    "load balancer",
  ]),
  SI("apache", "Apache", siApache, "web", "tech", ["web server", "httpd"]),
  SI("graphql", "GraphQL", siGraphql, "web", "tech", [
    "api",
    "query",
    "schema",
  ]),

  // Tools
  SI("postman", "Postman", siPostman, "tools", "tech", ["api", "test", "rest"]),
  SI("figma", "Figma", siFigma, "tools", "tech", ["design", "ui", "ux"]),
  SI("vite", "Vite", siVite, "tools", "tech", ["bundler", "build", "fast"]),
  SI("webpack", "Webpack", siWebpack, "tools", "tech", ["bundler", "build"]),
  SI("npm", "npm", siNpm, "tools", "tech", ["package", "registry", "node"]),
  SI("yarn", "Yarn", siYarn, "tools", "tech", ["package", "node"]),

  // Operating Systems
  SI("linux", "Linux", siLinux, "os", "tech", [
    "unix",
    "kernel",
    "open source",
  ]),
  SI("ubuntu", "Ubuntu", siUbuntu, "os", "tech", ["linux", "distro"]),
  SI("debian", "Debian", siDebian, "os", "tech", ["linux", "distro"]),
  SI("alpine", "Alpine Linux", siAlpinelinux, "os", "tech", [
    "linux",
    "container",
    "minimal",
  ]),
];

// ─── Cloud Icons ─────────────────────────────────────────────────────────────

const AWS_CLOUD_ICONS: IconEntry[] = [
  LC("aws-cloud", "AWS Cloud", "Cloud", "aws", "cloud", [
    "amazon",
    "aws",
    "provider",
  ]),
  LC("aws-ec2", "AWS EC2", "Server", "aws", "cloud", [
    "compute",
    "instance",
    "virtual machine",
    "ec2",
  ]),
  LC("aws-lambda", "AWS Lambda", "Zap", "aws", "cloud", [
    "function",
    "serverless",
    "faas",
    "lambda",
  ]),
  LC("aws-s3", "AWS S3", "HardDrive", "aws", "cloud", [
    "storage",
    "bucket",
    "object storage",
    "s3",
  ]),
  LC("aws-rds", "AWS RDS", "Database", "aws", "cloud", [
    "database",
    "sql",
    "relational",
    "rds",
  ]),
  LC("aws-dynamodb", "AWS DynamoDB", "Database", "aws", "cloud", [
    "nosql",
    "key value",
    "dynamodb",
  ]),
  LC("aws-vpc", "AWS VPC", "Network", "aws", "cloud", [
    "network",
    "subnet",
    "vpc",
  ]),
  LC("aws-route53", "AWS Route 53", "Globe", "aws", "cloud", [
    "dns",
    "route53",
    "domain",
  ]),
  LC("aws-cloudfront", "AWS CloudFront", "Globe", "aws", "cloud", [
    "cdn",
    "edge",
    "distribution",
    "cloudfront",
  ]),
  LC("aws-apigateway", "AWS API Gateway", "Router", "aws", "cloud", [
    "api",
    "gateway",
    "route",
  ]),
  LC("aws-sqs", "AWS SQS", "Inbox", "aws", "cloud", [
    "queue",
    "message",
    "sqs",
  ]),
  LC("aws-sns", "AWS SNS", "Inbox", "aws", "cloud", [
    "notification",
    "topic",
    "pubsub",
    "sns",
  ]),
  LC("aws-ecs", "AWS ECS", "Package", "aws", "cloud", [
    "container",
    "orchestration",
    "ecs",
  ]),
  LC("aws-eks", "AWS EKS", "Package", "aws", "cloud", [
    "kubernetes",
    "container",
    "eks",
  ]),
  LC("aws-cloudwatch", "AWS CloudWatch", "Activity", "aws", "cloud", [
    "monitoring",
    "metrics",
    "logs",
  ]),
  LC("aws-iam", "AWS IAM", "Shield", "aws", "cloud", [
    "identity",
    "auth",
    "access",
    "iam",
  ]),
  LC("aws-secrets-manager", "AWS Secrets Manager", "Key", "aws", "cloud", [
    "secrets",
    "key",
    "vault",
    "credentials",
  ]),
  LC("aws-codepipeline", "AWS CodePipeline", "GitBranch", "aws", "cloud", [
    "ci",
    "cd",
    "pipeline",
    "deploy",
  ]),
  LC("aws-sagemaker", "AWS SageMaker", "Cpu", "aws", "cloud", [
    "ml",
    "ai",
    "training",
    "inference",
  ]),
  LC("aws-kinesis", "AWS Kinesis", "Workflow", "aws", "cloud", [
    "stream",
    "event",
    "kinesis",
  ]),
  LC("aws-glue", "AWS Glue", "Braces", "aws", "cloud", [
    "etl",
    "data integration",
    "glue",
  ]),
  LC("aws-redshift", "AWS Redshift", "Database", "aws", "cloud", [
    "warehouse",
    "analytics",
    "redshift",
  ]),
  LC("aws-elasticache", "AWS ElastiCache", "Database", "aws", "cloud", [
    "cache",
    "redis",
    "memcached",
  ]),
  LC("aws-eventbridge", "AWS EventBridge", "Workflow", "aws", "cloud", [
    "event bus",
    "integration",
    "eventbridge",
  ]),
  LC("aws-step-functions", "AWS Step Functions", "Workflow", "aws", "cloud", [
    "state machine",
    "orchestration",
    "workflow",
  ]),
  LC("aws-waf", "AWS WAF", "Shield", "aws", "cloud", [
    "firewall",
    "security",
    "waf",
  ]),
  LC("aws-ses", "AWS SES", "Mail", "aws", "cloud", ["email", "smtp", "ses"]),
];

const AZURE_CLOUD_ICONS: IconEntry[] = [
  LC("azure-cloud", "Azure Cloud", "Cloud", "azure", "cloud", [
    "microsoft",
    "azure",
    "provider",
  ]),
  LC(
    "azure-virtual-machines",
    "Azure Virtual Machines",
    "Server",
    "azure",
    "cloud",
    ["vm", "compute", "virtual machine"],
  ),
  LC("azure-functions", "Azure Functions", "Zap", "azure", "cloud", [
    "serverless",
    "function",
    "faas",
  ]),
  LC("azure-app-service", "Azure App Service", "Server", "azure", "cloud", [
    "web app",
    "app service",
    "hosting",
  ]),
  LC(
    "azure-blob-storage",
    "Azure Blob Storage",
    "HardDrive",
    "azure",
    "cloud",
    ["storage", "blob", "object storage"],
  ),
  LC("azure-files", "Azure Files", "HardDrive", "azure", "cloud", [
    "file share",
    "storage",
    "smb",
  ]),
  LC("azure-sql-database", "Azure SQL Database", "Database", "azure", "cloud", [
    "sql",
    "database",
    "relational",
  ]),
  LC("azure-cosmos-db", "Azure Cosmos DB", "Database", "azure", "cloud", [
    "nosql",
    "globally distributed",
    "cosmos",
  ]),
  LC("azure-aks", "Azure Kubernetes Service", "Package", "azure", "cloud", [
    "aks",
    "kubernetes",
    "container",
  ]),
  LC(
    "azure-container-registry",
    "Azure Container Registry",
    "Package",
    "azure",
    "cloud",
    ["acr", "container", "registry", "image"],
  ),
  LC("azure-vnet", "Azure Virtual Network", "Network", "azure", "cloud", [
    "vnet",
    "network",
    "subnet",
  ]),
  LC("azure-front-door", "Azure Front Door", "Globe", "azure", "cloud", [
    "cdn",
    "edge",
    "global routing",
  ]),
  LC("azure-cdn", "Azure CDN", "Globe", "azure", "cloud", [
    "cdn",
    "edge",
    "content delivery",
  ]),
  LC(
    "azure-api-management",
    "Azure API Management",
    "Router",
    "azure",
    "cloud",
    ["api", "gateway", "apim"],
  ),
  LC("azure-service-bus", "Azure Service Bus", "Inbox", "azure", "cloud", [
    "queue",
    "message",
    "broker",
  ]),
  LC("azure-event-hubs", "Azure Event Hubs", "Workflow", "azure", "cloud", [
    "stream",
    "event ingestion",
    "event hubs",
  ]),
  LC("azure-monitor", "Azure Monitor", "Activity", "azure", "cloud", [
    "monitoring",
    "metrics",
    "logs",
  ]),
  LC(
    "azure-active-directory",
    "Azure Active Directory",
    "Shield",
    "azure",
    "cloud",
    ["entra", "identity", "auth", "aad"],
  ),
  LC("azure-key-vault", "Azure Key Vault", "Key", "azure", "cloud", [
    "secrets",
    "keys",
    "certificates",
    "vault",
  ]),
  LC("azure-devops", "Azure DevOps", "GitBranch", "azure", "cloud", [
    "ci",
    "cd",
    "pipeline",
    "repos",
  ]),
  LC("azure-logic-apps", "Azure Logic Apps", "Workflow", "azure", "cloud", [
    "workflow",
    "integration",
    "automation",
  ]),
  LC("azure-data-factory", "Azure Data Factory", "Braces", "azure", "cloud", [
    "etl",
    "data pipeline",
    "orchestration",
  ]),
];

const GCP_CLOUD_ICONS: IconEntry[] = [
  LC("gcp-cloud", "GCP Cloud", "Cloud", "gcp", "cloud", [
    "google cloud platform",
    "gcp",
    "provider",
  ]),
  LC("gcp-compute-engine", "GCP Compute Engine", "Server", "gcp", "cloud", [
    "vm",
    "compute",
    "instance",
    "gce",
  ]),
  LC("gcp-cloud-run", "GCP Cloud Run", "Zap", "gcp", "cloud", [
    "serverless",
    "container",
    "cloud run",
  ]),
  LC("gcp-cloud-functions", "GCP Cloud Functions", "Zap", "gcp", "cloud", [
    "function",
    "serverless",
    "faas",
  ]),
  LC("gcp-cloud-storage", "GCP Cloud Storage", "HardDrive", "gcp", "cloud", [
    "gcs",
    "storage",
    "bucket",
  ]),
  LC("gcp-cloud-sql", "GCP Cloud SQL", "Database", "gcp", "cloud", [
    "sql",
    "relational",
    "database",
  ]),
  LC("gcp-firestore", "GCP Firestore", "Database", "gcp", "cloud", [
    "nosql",
    "document",
    "firebase",
    "firestore",
  ]),
  LC("gcp-bigquery", "GCP BigQuery", "Database", "gcp", "cloud", [
    "warehouse",
    "analytics",
    "bigquery",
  ]),
  LC("gcp-pubsub", "GCP Pub/Sub", "Inbox", "gcp", "cloud", [
    "queue",
    "message",
    "event",
    "pubsub",
  ]),
  LC("gcp-gke", "GCP GKE", "Package", "gcp", "cloud", [
    "kubernetes",
    "container",
    "gke",
  ]),
  LC("gcp-vpc", "GCP VPC", "Network", "gcp", "cloud", [
    "network",
    "subnet",
    "vpc",
  ]),
  LC("gcp-load-balancing", "GCP Load Balancing", "Globe", "gcp", "cloud", [
    "load balancer",
    "traffic",
    "lb",
  ]),
  LC("gcp-cloud-cdn", "GCP Cloud CDN", "Globe", "gcp", "cloud", [
    "cdn",
    "edge",
    "content delivery",
  ]),
  LC("gcp-cloud-dns", "GCP Cloud DNS", "Globe", "gcp", "cloud", [
    "dns",
    "domain",
    "routing",
  ]),
  LC("gcp-api-gateway", "GCP API Gateway", "Router", "gcp", "cloud", [
    "api",
    "gateway",
    "proxy",
  ]),
  LC("gcp-cloud-build", "GCP Cloud Build", "GitBranch", "gcp", "cloud", [
    "ci",
    "cd",
    "pipeline",
    "build",
  ]),
  LC(
    "gcp-cloud-monitoring",
    "GCP Cloud Monitoring",
    "Activity",
    "gcp",
    "cloud",
    ["monitoring", "metrics", "logs", "operations"],
  ),
  LC("gcp-secret-manager", "GCP Secret Manager", "Key", "gcp", "cloud", [
    "secret",
    "vault",
    "credential",
  ]),
  LC("gcp-vertex-ai", "GCP Vertex AI", "Cpu", "gcp", "cloud", [
    "ml",
    "ai",
    "vertex",
    "inference",
  ]),
  LC("gcp-dataflow", "GCP Dataflow", "Workflow", "gcp", "cloud", [
    "streaming",
    "batch",
    "pipeline",
  ]),
  LC("gcp-dataproc", "GCP Dataproc", "Braces", "gcp", "cloud", [
    "spark",
    "hadoop",
    "cluster",
  ]),
];

const CLOUD_ICONS: IconEntry[] = [
  // Providers
  SI("gcp", "Google Cloud", siGooglecloud, "providers", "cloud", [
    "gcp",
    "google",
    "cloud",
  ]),
  SI("gcs", "Cloud Storage", siGooglecloudstorage, "providers", "cloud", [
    "gcp",
    "storage",
    "bucket",
  ]),
  SI("cloudflare", "Cloudflare", siCloudflare, "providers", "cloud", [
    "cdn",
    "dns",
    "security",
  ]),
  SI("cloudflare-pages", "CF Pages", siCloudflarepages, "providers", "cloud", [
    "hosting",
    "static",
    "deploy",
  ]),
  SI(
    "cloudflare-workers",
    "CF Workers",
    siCloudflareworkers,
    "providers",
    "cloud",
    ["serverless", "edge", "function"],
  ),
  SI("vercel", "Vercel", siVercel, "providers", "cloud", [
    "hosting",
    "deploy",
    "nextjs",
    "edge",
  ]),
  SI("netlify", "Netlify", siNetlify, "providers", "cloud", [
    "hosting",
    "deploy",
    "static",
    "jamstack",
  ]),
  SI("digitalocean", "DigitalOcean", siDigitalocean, "providers", "cloud", [
    "vps",
    "droplet",
    "hosting",
  ]),
  SI("nextcloud", "Nextcloud", siNextcloud, "providers", "cloud", [
    "self-hosted",
    "storage",
    "files",
  ]),
  ...AWS_CLOUD_ICONS,
  ...AZURE_CLOUD_ICONS,
  ...GCP_CLOUD_ICONS,
];

// ─── Combined registry ────────────────────────────────────────────────────────

export const ALL_ICONS: IconEntry[] = [
  ...GENERAL_ICONS,
  ...TECH_ICONS,
  ...CLOUD_ICONS,
];

// ─── Subcategory display names ────────────────────────────────────────────────

export const SUBCATEGORY_LABELS: Record<string, string> = {
  shapes: "Shapes",
  arrows: "Arrows",
  navigation: "Navigation",
  actions: "Actions",
  files: "Files & Storage",
  communication: "Communication",
  users: "People & Users",
  security: "Security",
  system: "System & Dev",
  media: "Media",
  analytics: "Analytics",
  status: "Status & Alerts",
  time: "Time & Schedule",
  labels: "Labels & Tags",
  layout: "Layout & UI",
  devices: "Devices",
  misc: "Miscellaneous",
  containers: "Containers & Orchestration",
  devops: "DevOps & CI/CD",
  languages: "Languages",
  frameworks: "Frameworks",
  databases: "Databases",
  messaging: "Messaging",
  web: "Web & API",
  tools: "Tools",
  os: "Operating Systems",
  providers: "Cloud Providers",
  aws: "AWS",
  azure: "Azure",
  gcp: "Google Cloud",
};

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchIcons(
  query: string,
  category?: IconCategory,
): IconEntry[] {
  const q = query.toLowerCase().trim();
  return ALL_ICONS.filter((icon) => {
    if (category && icon.category !== category) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      icon.name.toLowerCase().includes(q) ||
      icon.keywords.some((k) => k.includes(q)) ||
      icon.subcategory.includes(q)
    );
  });
}
