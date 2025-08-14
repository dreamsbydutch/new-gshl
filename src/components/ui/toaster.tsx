"use client";

/**
 * Toaster Component
 *
 * Main toaster component that renders all active toast notifications.
 * Note: Requires useToast hook implementation to be fully functional.
 */

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast";
import React from "react";

/**
 * Toaster component that renders all active toast notifications
 * @returns Toast provider with rendered toasts
 */
export function Toaster() {
  // TODO: Replace placeholder with real useToast hook implementation
  type AppToast = {
    id: string | number;
    title?: string;
    description?: string;
    action?: React.ReactNode;
  } & Omit<
    React.ComponentProps<typeof Toast>,
    "title" | "description" | "action" | "id"
  >;
  const toasts: AppToast[] = [];

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
