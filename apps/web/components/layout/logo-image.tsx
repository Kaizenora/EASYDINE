"use client";

import { useState } from "react";

const FALLBACK_SRC = "/logo.png";

export function LogoImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc = failedSrc === src ? FALLBACK_SRC : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (imageSrc !== FALLBACK_SRC) setFailedSrc(src);
      }}
    />
  );
}
