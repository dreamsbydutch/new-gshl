# UI System

Complete guide to the GSHL UI component library, design system, and styling patterns.

---

## Table of Contents

- [Overview](#overview)
- [Design System](#design-system)
- [Component Library](#component-library)
- [Tailwind Configuration](#tailwind-configuration)
- [Styling Patterns](#styling-patterns)
- [Responsive Design](#responsive-design)
- [Adding New Components](#adding-new-components)

---

## Overview

GSHL uses a modern, accessible UI stack:

- **shadcn/ui** - Radix UI primitives with Tailwind styling
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Geist Font** - Sans-serif typeface
- **CSS Variables** - Theme customization

---

## Design System

### Color Palette

Defined in `src/styles/globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark theme colors */
}
```

### Typography

```typescript
// Font configuration in src/app/layout.tsx
import { GeistSans } from "geist/font/sans";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>{children}</body>
    </html>
  );
}
```

**Scale**:

- `text-xs` - 12px
- `text-sm` - 14px
- `text-base` - 16px (default)
- `text-lg` - 18px
- `text-xl` - 20px
- `text-2xl` - 24px
- `text-3xl` - 30px
- `text-4xl` - 36px

### Spacing

Tailwind spacing scale (4px base unit):

- `p-1` / `m-1` - 4px
- `p-2` / `m-2` - 8px
- `p-4` / `m-4` - 16px
- `p-6` / `m-6` - 24px
- `p-8` / `m-8` - 32px

---

## Component Library

### Primitive Components

Located in `src/components/ui/`:

#### Button

```typescript
import { Button } from "@gshl-ui";

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon">
  <Icon />
</Button>
```

#### Dropdown Menu

```typescript
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gshl-ui";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>Open Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

#### Popover

```typescript
import { Popover, PopoverContent, PopoverTrigger } from "@gshl-ui";

<Popover>
  <PopoverTrigger asChild>
    <Button>Open</Button>
  </PopoverTrigger>
  <PopoverContent>
    <p>Popover content</p>
  </PopoverContent>
</Popover>
```

#### Toast

```typescript
import { useToast } from "@gshl-ui";

export function MyComponent() {
  const { toast } = useToast();

  const showToast = () => {
    toast({
      title: "Success!",
      description: "Your action completed successfully.",
    });
  };

  return <Button onClick={showToast}>Show Toast</Button>;
}
```

### Available UI Components

| Component         | File                        | Purpose               |
| ----------------- | --------------------------- | --------------------- |
| **button**        | `button.tsx`                | Buttons with variants |
| **dropdown-menu** | `dropdown-menu.tsx`         | Context menus         |
| **popover**       | `popover.tsx`               | Floating content      |
| **toast**         | `toast.tsx` + `toaster.tsx` | Notifications         |
| **slot**          | `slot.tsx`                  | Radix Slot primitive  |

---

## Tailwind Configuration

### Configuration File

`tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... more color tokens
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

### Custom Utilities

The `cn` utility merges Tailwind classes:

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage**:

```typescript
import { cn } from "@gshl-utils";

<div className={cn(
  "base-classes",
  condition && "conditional-classes",
  prop.className // Merge with prop classes
)}>
```

---

## Styling Patterns

### Table Layouts

```tsx
<div className="overflow-x-auto">
  <table className="min-w-full">
    <thead className="bg-muted">
      <tr>
        <th className="bg-muted sticky left-0 z-10 px-4 py-2 text-left">
          Column 1
        </th>
        <th className="px-4 py-2 text-left">Column 2</th>
      </tr>
    </thead>
    <tbody>
      <tr className="hover:bg-accent border-b">
        <td className="bg-background sticky left-0 z-10 px-4 py-2">Cell 1</td>
        <td className="px-4 py-2">Cell 2</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Key Patterns**:

- `overflow-x-auto` - Horizontal scroll
- `sticky left-0` - Frozen first column
- `z-10` - Ensure sticky cells stay on top
- `hover:bg-accent` - Row hover effect

### Card Layouts

```tsx
<div className="bg-card text-card-foreground rounded-lg border shadow-sm">
  <div className="p-6">
    <h3 className="text-2xl font-semibold">Card Title</h3>
    <p className="text-muted-foreground text-sm">Card description</p>
  </div>
  <div className="p-6 pt-0">{/* Card content */}</div>
</div>
```

### Grid Layouts

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  <div className="rounded-lg border p-4">Item 1</div>
  <div className="rounded-lg border p-4">Item 2</div>
  <div className="rounded-lg border p-4">Item 3</div>
</div>
```

### Flexbox Layouts

```tsx
<div className="flex items-center justify-between gap-4">
  <div>Left content</div>
  <div>Right content</div>
</div>
```

---

## Responsive Design

### Breakpoints

```typescript
// Tailwind default breakpoints
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### Responsive Utilities

```tsx
<div className="
  text-sm           /* Mobile: small text */
  md:text-base      /* Tablet: base text */
  lg:text-lg        /* Desktop: large text */

  grid-cols-1       /* Mobile: 1 column */
  md:grid-cols-2    /* Tablet: 2 columns */
  lg:grid-cols-3    /* Desktop: 3 columns */

  p-4               /* Mobile: 16px padding */
  md:p-6            /* Tablet: 24px padding */
  lg:p-8            /* Desktop: 32px padding */
">
```

### Mobile-First Approach

Default styles apply to mobile, then override for larger screens:

```tsx
// ❌ BAD: Desktop-first
<div className="lg:text-lg md:text-base text-sm">

// ✅ GOOD: Mobile-first
<div className="text-sm md:text-base lg:text-lg">
```

---

## Adding New Components

### Using shadcn/ui CLI

```bash
# Add a component
npx shadcn-ui@latest add dialog

# Add multiple components
npx shadcn-ui@latest add dialog alert card
```

This adds components to `src/components/ui/` with full TypeScript types.

### Manual Component Creation

```typescript
// src/components/ui/my-component.tsx
import * as React from "react";
import { cn } from "@gshl-utils";

export interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline";
}

export const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "base-classes",
          variant === "outline" && "outline-variant-classes",
          className
        )}
        {...props}
      />
    );
  }
);

MyComponent.displayName = "MyComponent";
```

### Export via Barrel

```typescript
// src/components/ui/index.ts
export { MyComponent } from "./my-component";
export type { MyComponentProps } from "./my-component";
```

---

## Icon Usage

### Lucide React

```typescript
import { User, Settings, LogOut } from "lucide-react";

<Button>
  <User className="mr-2 h-4 w-4" />
  Profile
</Button>

<Settings className="h-6 w-6 text-muted-foreground" />
```

**Common Sizes**:

- `h-4 w-4` - Small icons (16px)
- `h-5 w-5` - Medium icons (20px)
- `h-6 w-6` - Large icons (24px)

---

## Loading States

### Skeleton Components

Located in `src/components/skeletons/`:

```typescript
import { TeamRosterSkeleton } from "@gshl-skeletons";

export function TeamPage() {
  const { team, ready } = useTeam();

  if (!ready) return <TeamRosterSkeleton />;
  return <TeamRoster team={team} />;
}
```

### Inline Skeletons

```tsx
<div className="animate-pulse">
  <div className="bg-muted h-4 w-32 rounded"></div>
  <div className="bg-muted mt-2 h-4 w-48 rounded"></div>
</div>
```

---

## Next Steps

To dive deeper:

- **[Component Architecture](./COMPONENTS.md)** - Build features
- **[Hooks & State](./HOOKS.md)** - Data patterns
- **[Tailwind Docs](https://tailwindcss.com/docs)** - Full utility reference

---

_For UI component source code, see `src/components/ui/`_
