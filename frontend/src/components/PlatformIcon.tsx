// Simplified platform marks, drawn in each platform's own colour so they read at a glance.

export const PLATFORM_COLOR: Record<string, string> = {
  instagram: "#e1306c", whatsapp: "#25d366", facebook: "#1877f2", linkedin: "#0a66c2", youtube: "#ff0000", x: "#0f1419",
};

export function PlatformIcon({ platform, className = "h-5 w-5", mono = false }: { platform: string; className?: string; mono?: boolean }) {
  const color = mono ? "currentColor" : PLATFORM_COLOR[platform] ?? "currentColor";
  const stroke = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (platform) {
    case "instagram":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...stroke} />
          <circle cx="12" cy="12" r="4" {...stroke} />
          <circle cx="17.2" cy="6.8" r="1.1" fill={color} />
        </svg>
      );
    case "whatsapp":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" {...stroke} />
          <path d="M9.2 8.6c.2-.4.5-.4.8-.4h.4c.2 0 .4 0 .5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.4c0 .3 0 .6-.4.8-.5.3-1.3.5-2.1.3-2.3-.6-4.4-2.6-5-4.9-.2-.9 0-1.7.4-2.3z" fill={color} />
        </svg>
      );
    case "facebook":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" fill={color} />
        </svg>
      );
    case "linkedin":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          {/* In single-colour mode the square becomes an outline so the letters stay visible. */}
          <rect x="3" y="3" width="18" height="18" rx="3.5" fill={mono ? "none" : color} stroke={mono ? color : "none"} strokeWidth="1.6" />
          <path d="M7.4 10.2h2v6.6h-2zM8.4 6.9a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM11 10.2h1.9v.9c.3-.5.9-1.1 2-1.1 2 0 2.4 1.3 2.4 3v3.8h-2v-3.4c0-.8 0-1.8-1.1-1.8s-1.3.9-1.3 1.8v3.4H11z" fill={mono ? color : "#ffffff"} />
        </svg>
      );
    case "youtube":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" fill={mono ? "none" : color} stroke={mono ? color : "none"} strokeWidth="1.6" />
          <path d="M10.2 9.2v5.6l4.8-2.8z" fill={mono ? color : "#ffffff"} />
        </svg>
      );
    case "x":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <path d="M4.5 4h4.3l10.7 16h-4.3z" fill="none" stroke={mono ? color : "currentColor"} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M19 4l-6 6.8M5 20l6-6.8" fill="none" stroke={mono ? color : "currentColor"} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
          <circle cx="12" cy="12" r="8" {...stroke} />
        </svg>
      );
  }
}
