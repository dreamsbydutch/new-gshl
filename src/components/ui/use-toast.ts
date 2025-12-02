"use client";

import * as React from "react";
import type { ToastActionElement, ToastProps } from "./toast";

const TOAST_REMOVE_DELAY = 1000;
const TOAST_LIMIT = 5;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Toast = Omit<ToasterToast, "id"> & { id?: string };

type ToastState = {
  toasts: ToasterToast[];
};

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<(state: ToastState) => void>();
let memoryState: ToastState = { toasts: [] };

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const reducer = (state: ToastState, action: Action): ToastState => {
  switch (action.type) {
    case "ADD_TOAST": {
      const remaining = state.toasts.slice(0, TOAST_LIMIT - 1);
      return {
        ...state,
        toasts: [action.toast, ...remaining],
      };
    }
    case "UPDATE_TOAST": {
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toast.id ? { ...toast, ...action.toast } : toast,
        ),
      };
    }
    case "DISMISS_TOAST": {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === toastId || toastId === undefined
            ? { ...toast, open: false }
            : toast,
        ),
      };
    }
    case "REMOVE_TOAST": {
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }

      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.toastId),
      };
    }
    default:
      return state;
  }
};

const dispatch = (action: Action) => {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
};

export const toast = (props: Toast) => {
  const id = props.id ?? Math.random().toString(36).slice(2, 10);
  const toast: ToasterToast = {
    ...props,
    id,
    open: true,
  };

  dispatch({ type: "ADD_TOAST", toast });
  return id;
};

export const useToast = () => {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const dismiss = React.useCallback((toastId?: string) => {
    dispatch({ type: "DISMISS_TOAST", toastId });
  }, []);

  return {
    ...state,
    toast,
    dismiss,
  };
};

export type { ToasterToast };
