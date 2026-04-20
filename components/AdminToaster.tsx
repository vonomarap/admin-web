"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";

export function AdminToaster(): JSX.Element {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Toaster
      theme={mounted && resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "font-sans",
          title: "font-medium",
          description: "text-sm",
        },
      }}
    />
  );
}
