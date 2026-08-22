"use client";

import Image from "next/image";
import type { WhatsAppShareButtonProps } from "@gshl-types";
import {
  appendWhatsAppShareLink,
  buildWhatsAppShareUrl,
  resolveWhatsAppShareLink,
} from "@gshl-utils/features/whatsapp-share";
import { Button } from "./ButtonPrimitive";

const WHATSAPP_SHARE_ICON_URL =
  "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMXk35G8s9eUFO1XWmtTViK8j9IM3506pqAgZN";

export function WhatsAppShareButton({
  message,
  path,
  label = "Share to WhatsApp",
  ariaLabel,
  disabled,
  type = "button",
  variant = "outline",
  size = "sm",
  ...buttonProps
}: WhatsAppShareButtonProps) {
  const share = () => {
    const url = resolveWhatsAppShareLink(
      path,
      window.location.href,
      window.location.origin,
    );
    const text = appendWhatsAppShareLink(message, url);
    window.open(buildWhatsAppShareUrl(text), "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      {...buttonProps}
      type={type}
      variant={variant}
      size={size}
      aria-label={ariaLabel ?? label}
      disabled={disabled === true || !message.trim()}
      onClick={share}
    >
      <Image
        src={WHATSAPP_SHARE_ICON_URL}
        alt=""
        width={18}
        height={18}
        className="h-[18px] w-[18px] shrink-0 rounded-[3px] object-contain"
        aria-hidden="true"
      />
      {label}
    </Button>
  );
}
