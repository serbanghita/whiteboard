/**
 * The system-design primitives: each is a rectangle-tool variant that stamps
 * a TextComponent label on the drawn shape (RectangleDrawSystem). Single
 * source of truth - the ToolType union, the SYS panel buttons and the
 * stamped labels are all derived from this list.
 *
 * Ordered by importance (the SYS panel renders top-to-bottom, left-to-right
 * in this order): the classic request path first (client → edge → compute →
 * storage), then async processing, then supporting infrastructure.
 */
export const SYSTEM_DESIGN_TOOLS = [
  { id: "client",   title: "Client",           label: "Client" },
  { id: "server",   title: "Server",           label: "Server" },
  { id: "db",       title: "Database",         label: "DB" },
  { id: "cache",    title: "Cache",            label: "Cache" },
  { id: "lb",       title: "Load Balancer",    label: "LB" },
  { id: "gw",       title: "Gateway",          label: "GW" },
  { id: "queue",    title: "Queue",            label: "Queue" },
  { id: "cdn",      title: "CDN",              label: "CDN" },
  { id: "objstore", title: "Object Storage",   label: "Object Store" },
  { id: "worker",   title: "Worker",           label: "Worker" },
  { id: "stream",   title: "Stream / Pub-Sub", label: "Stream" },
  { id: "extapi",   title: "External API",     label: "External API" },
  { id: "search",   title: "Search Index",     label: "Search" },
  { id: "dns",      title: "DNS",              label: "DNS" },
  { id: "monitor",  title: "Monitoring",       label: "Monitoring" },
  { id: "cron",     title: "Scheduler / Cron", label: "Cron" },
  { id: "auth",     title: "Auth / Identity",  label: "Auth" },
] as const;

export type SystemDesignToolId = (typeof SYSTEM_DESIGN_TOOLS)[number]["id"];

export function isSystemDesignTool(tool: string): tool is SystemDesignToolId {
  return SYSTEM_DESIGN_TOOLS.some(t => t.id === tool);
}

export function systemDesignLabel(tool: string): string | undefined {
  return SYSTEM_DESIGN_TOOLS.find(t => t.id === tool)?.label;
}
