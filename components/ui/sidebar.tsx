"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Menu } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

type SidebarContextValue = {
  mobileOpen: boolean;
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar(): SidebarContextValue {
  const value = React.useContext(SidebarContext);
  return value ?? { mobileOpen: false, setMobileOpen: () => undefined };
}

function SidebarProvider({
  children,
  defaultMobileOpen = false,
}: {
  children: React.ReactNode;
  defaultMobileOpen?: boolean;
}): JSX.Element {
  const [mobileOpen, setMobileOpen] = React.useState(defaultMobileOpen);

  return <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>{children}</SidebarContext.Provider>;
}

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    mobileTitle?: React.ReactNode;
  }
>(({ className, children, mobileTitle = "Навигация", ...props }, ref) => {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <aside className="hidden lg:block lg:w-72 lg:shrink-0">
        <div
          ref={ref}
          className={cn(
            "sticky top-5 flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[320px] border-r border-border/70 p-0 sm:max-w-[320px]">
          <SheetHeader className="sr-only">
            <SheetTitle>{mobileTitle}</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col overflow-hidden p-3">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
});
Sidebar.displayName = "Sidebar";

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("min-w-0 flex-1", className)} {...props} />
));
SidebarInset.displayName = "SidebarInset";

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-2 border-b border-border/70 px-2 pb-3", className)} {...props} />
));
SidebarHeader.displayName = "SidebarHeader";

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-3", className)} {...props} />
));
SidebarContent.displayName = "SidebarContent";

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("border-t border-border/70 px-2 pt-3", className)} {...props} />
));
SidebarFooter.displayName = "SidebarFooter";

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("grid gap-1", className)} {...props} />
));
SidebarGroup.displayName = "SidebarGroup";

const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn("grid gap-1", className)} {...props} />
));
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("list-none", className)} {...props} />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      isActive: {
        true: "bg-secondary text-secondary-foreground shadow-xs",
        false: "",
      },
      size: {
        default: "min-h-10",
        sm: "min-h-9 text-xs",
      },
    },
    defaultVariants: {
      isActive: false,
      size: "default",
    },
  }
);

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof sidebarMenuButtonVariants> & {
      asChild?: boolean;
    }
>(({ className, asChild = false, isActive, size, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(sidebarMenuButtonVariants({ isActive, size }), className)} {...props} />;
});
SidebarMenuButton.displayName = "SidebarMenuButton";

function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>): JSX.Element {
  const { setMobileOpen } = useSidebar();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("lg:hidden", className)}
      onClick={() => setMobileOpen(true)}
      {...props}
    >
      <Menu />
      <span className="sr-only">Открыть навигацию</span>
    </Button>
  );
}

export {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
};
