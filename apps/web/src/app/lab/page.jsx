import { Suspense } from "react";
import { Lab } from "@web/components/lab";
export const metadata = { title: "Workbench" };
export default function Page() {
  return (
    <Suspense
      fallback={<div className="lab-loading">Setting up your bench…</div>}
    >
      <Lab />
    </Suspense>
  );
}
