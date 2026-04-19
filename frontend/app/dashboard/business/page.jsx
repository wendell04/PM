"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BusinessRoot() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/business/dashboardoverview");
  }, [router]);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        color: "var(--gray)",
        fontSize: "0.875rem",
      }}
    >
      Redirecting...
    </div>
  );
}
