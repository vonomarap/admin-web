"use client";

import { usePathname, useRouter } from "next/navigation";
import { Card } from "./ui/card";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type PromosTab = "banners" | "codes";

function tabFromPathname(pathname: string): PromosTab {
  if (pathname === "/promos/codes" || pathname.startsWith("/promos/codes/")) return "codes";
  return "banners";
}

export function PromosTabs(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname() || "/promos";
  const active = tabFromPathname(pathname);

  return (
    <Card className="p-3">
      <Tabs
        value={active}
        onValueChange={(next) => router.push(next === "codes" ? "/promos/codes" : "/promos")}
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="banners">Баннеры</TabsTrigger>
          <TabsTrigger value="codes">Промокоды</TabsTrigger>
        </TabsList>
      </Tabs>
    </Card>
  );
}
