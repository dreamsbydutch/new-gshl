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
import { useToast } from "./use-toast";

/**
 * Toaster component that renders all active toast notifications
 * @returns Toast provider with rendered toasts
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast
          key={id}
          {...props}
          onOpenChange={(open) => {
            if (!open) {
              dismiss(id);
            }
          }}
        >
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
