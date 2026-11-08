import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";

const Teleprompter = lazy(() => import("@/components/tp/Teleprompter"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Speak to the Lens — teleprompter and speaking coach" },
      { name: "description", content: "Prepare your script, follow natural speaking phrases, record yourself and review your takes — all on your phone." },
      { property: "og:title", content: "Speak to the Lens" },
      { property: "og:description", content: "A focused teleprompter and speaking coach for natural delivery on camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Splash() {
  return <div className="fixed inset-0 flex items-center justify-center bg-background text-2xl font-extrabold text-primary">Speak to the Lens</div>;
}

function Index() {
  return (
    <ClientOnly fallback={<Splash />}>
      <Suspense fallback={<Splash />}>
        <Teleprompter />
      </Suspense>
      <Toaster position="top-center" />
    </ClientOnly>
  );
}
