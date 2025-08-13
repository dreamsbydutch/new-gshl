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

/**
 * Toaster component that renders all active toast notifications
 * @returns Toast provider with rendered toasts
 */
export function Toaster() {
  // TODO: Implement useToast hook or import from appropriate location
  const toasts: any[] = [];

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
