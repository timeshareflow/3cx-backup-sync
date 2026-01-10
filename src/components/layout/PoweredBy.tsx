"use client";

import Image from "next/image";

export function PoweredBy() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
      <span>Powered by</span>
      <a
        href="https://wizprosoftware.com"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        <Image
          src="/wizpro-logo.png"
          alt="WizPro Software"
          width={24}
          height={24}
          className="rounded"
        />
        <span className="font-semibold text-foreground">WizPro Software</span>
      </a>
    </div>
  );
}
