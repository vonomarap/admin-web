"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminSession } from "./AdminSessionProvider";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function FabMenu(): JSX.Element | null {
  const session = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  if (session.status !== "ready") return null;
  if (pathname?.startsWith("/products/new") || pathname?.startsWith("/gallery/new")) return null;

  const go = (to: string) => {
    router.push(to);
  };

  return (
    <div className="fabWrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" className="fabButton rounded-full" aria-label="Добавить">
            <span className="fabIcon" aria-hidden="true">
              <Plus className="h-5 w-5" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" sideOffset={12}>
          <DropdownMenuItem onClick={() => go("/products/new")}>Добавить товар</DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/gallery/new")}>Добавить кейс</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
