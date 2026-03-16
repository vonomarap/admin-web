"use client";

import type { ReactNode } from "react";
import { AdminNav } from "./AdminNav";

export function AdminHeader({
  title,
  subtitle,
  rightActions,
}: {
  title: string;
  subtitle?: string;
  rightActions?: ReactNode;
}): JSX.Element {
  return (
    <section className="card adminHeader">
      <div className="adminHeaderTop">
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {subtitle ? <small className="breakLong">{subtitle}</small> : null}
        </div>
        {rightActions ? <div className="topbarActions">{rightActions}</div> : null}
      </div>
      <AdminNav />
    </section>
  );
}

