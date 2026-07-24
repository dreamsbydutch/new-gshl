/**
 * UI Components Barrel Exports
 *
 * Centralized export point for all UI components in the application.
 */

// Button Components
export { Button, buttonVariants } from "./ButtonPrimitive";
export type { ButtonProps } from "@gshl-types";

// Form Controls
export { Input } from "./InputPrimitive";
export { Label } from "./LabelPrimitive";
export { Select } from "./SelectPrimitive";
export type { InputProps, LabelProps, SelectProps } from "@gshl-types";

// Dropdown Menu Components
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./DropdownMenuPrimitive";

// Loading Components
export { LoadingSpinner } from "./LoadingSpinnerPrimitive";

// Popover Components
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from "./PopoverPrimitive";

// Skeleton Components
export { Skeleton } from "./SkeletonPrimitive";

// Table Components
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./TablePrimitive";

// Toast Components
export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "./ToastPrimitive";

export { Toaster } from "./ToasterPrimitive";
