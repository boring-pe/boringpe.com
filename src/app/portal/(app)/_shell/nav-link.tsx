"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Prefetch a page only when someone shows they mean to open it: the pointer rests on the link
 * for a moment, or it gets focus or a touch. Prefetching everything in view would ask the server
 * for every page in the sidebar on every visit.
 */
const HOVER_MS = 100;
let timer: ReturnType<typeof setTimeout> | undefined;

/** A <Link> that prefetches on intent. Put <Pending /> inside it to show that this click is loading. */
export function IntentLink(props: ComponentProps<typeof Link>) {
  const router = useRouter();
  const href = typeof props.href === "string" ? props.href : null;
  if (!href || props.prefetch !== undefined) return <Link {...props} />;
  const go = () => router.prefetch(href);
  return (
    <Link
      {...props}
      prefetch={false}
      onMouseEnter={(e) => { props.onMouseEnter?.(e); clearTimeout(timer); timer = setTimeout(go, HOVER_MS); }}
      onMouseLeave={(e) => { props.onMouseLeave?.(e); clearTimeout(timer); }}
      onFocus={(e) => { props.onFocus?.(e); go(); }}
      onTouchStart={(e) => { props.onTouchStart?.(e); go(); }}
    />
  );
}

/** Inside a link: shows `children` normally and a small spinner while that link's page loads. */
export function Pending({ children, className = "h-4 w-4" }: { children?: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 aria-hidden className={`${className} shrink-0 animate-spin text-blue-400`} data-link-pending />;
  return <>{children}</>;
}

/** Inside a card that is a link: covers it with a soft veil and a spinner while its page loads. */
export function PendingVeil() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className="absolute inset-0 z-10 grid place-items-center rounded-[inherit]" style={{ background: "color-mix(in oklab, var(--p-bg) 55%, transparent)" }} data-link-pending>
      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
    </span>
  );
}
