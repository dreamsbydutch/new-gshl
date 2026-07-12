import type * as React from "react";
import type * as ToastPrimitives from "@radix-ui/react-toast";

export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  onValueChange?: (value: string) => void;
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export type ToastVariant = "default" | "destructive";

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> {
  variant?: ToastVariant;
}

export type ToastActionElement = React.ReactElement;

export type ToasterToast = Omit<ToastProps, "title"> & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

export type ToastInput = Omit<ToasterToast, "id"> & { id?: string };

export interface ToastState {
  toasts: ToasterToast[];
}

export type ToastAction =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };
