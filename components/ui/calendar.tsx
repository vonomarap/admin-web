"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { ru } from "date-fns/locale";
import { cn } from "../../lib/utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  captionLayout = "label",
  ...props
}: DayPickerProps): JSX.Element {
  return (
    <DayPicker
      locale={ru}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      captionLayout={captionLayout}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-4",
        month: "grid gap-4",
        month_caption: "relative flex items-center justify-center px-7 pt-1",
        caption_label: "text-sm font-medium",
        dropdowns: "flex items-center gap-2",
        dropdown_root: "relative",
        dropdown: "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "absolute left-1 size-7 p-0 text-muted-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-1 size-7 p-0 text-muted-foreground"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        weeks: "grid gap-1",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm [&:has(button[aria-selected='true'])]:rounded-md",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal text-foreground aria-selected:bg-primary aria-selected:text-primary-foreground"
        ),
        today: "rounded-md bg-accent text-accent-foreground",
        selected: "rounded-md bg-primary text-primary-foreground",
        outside: "text-muted-foreground opacity-50 aria-selected:bg-accent aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        chevron: "size-4",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", iconClassName)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("size-4", iconClassName)} {...iconProps} />
          ),
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
