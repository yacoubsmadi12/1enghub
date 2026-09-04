import { cn } from "@/lib/utils";

export default function BrandMark({ className }: { className?: string }) {
  return <div className={cn("brand-mark", className)} aria-label="ENGHUB logo" role="img">
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="enghub-mark-gradient" x1="5" y1="4" x2="35" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d7ffff" />
          <stop offset=".48" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#49b8df" />
        </linearGradient>
      </defs>
      <path className="brand-mark-orbit" d="M20 4.5 33.4 12v16L20 35.5 6.6 28V12L20 4.5Z" />
      <path className="brand-mark-path" d="M11 25.5V14.7l9-5 9 5v10.8l-9 5-9-5Z" />
      <path className="brand-mark-link" d="m11.3 20 8.7 5 8.7-5M20 25V9.8" />
      <circle className="brand-mark-node" cx="11" cy="20" r="2.2" />
      <circle className="brand-mark-node" cx="20" cy="25" r="2.2" />
      <circle className="brand-mark-node" cx="29" cy="20" r="2.2" />
      <circle className="brand-mark-node" cx="20" cy="10" r="2.2" />
    </svg>
  </div>;
}
