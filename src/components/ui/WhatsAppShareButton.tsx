"use client";

import { MessageCircle } from "lucide-react";
import type { WhatsAppShareButtonProps } from "@gshl-types";
import {
  buildWhatsAppShareMessage,
  buildWhatsAppShareUrl,
  resolveWhatsAppShareLink,
} from "@gshl-utils/features/whatsapp-share";
import { Button } from "./ButtonPrimitive";

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
    const text = buildWhatsAppShareMessage({ title: message, url });
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
      <MessageCircle aria-hidden="true" />
      {label}
    </Button>
  );
}
