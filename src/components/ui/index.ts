/**
 * UI Components Barrel Exports
 *
 * Centralized export point for all UI components in the application.
 */

// Button Components
export { Button, buttonVariants, type ButtonProps } from "./button";

// Form Controls
export { Input, type InputProps } from "./input";
export { Label, type LabelProps } from "./label";
export { Select, type SelectProps } from "./select";

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
} from "./dropdown-menu";

// Loading Components
export { LoadingSpinner } from "./loadingSpinner";

// Popover Components
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from "./popover";

// Skeleton Components
export { Skeleton } from "./skeleton";

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
} from "./table";

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
} from "./toast";

export { Toaster } from "./toaster";
export { useToast, toast } from "./use-toast";

// NHL Logo Component
export { NHLLogo } from "./nhlLogo";
