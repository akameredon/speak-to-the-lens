import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";

const Teleprompter = lazy(() => import("@/components/tp/Teleprompter"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Teleprompter — your script by the lens" },
      { name: "description", content: "Your script sits right by the lens, follows your voice, and never jumps back. Record, review and keep every take on your phone." },
      { property: "og:title", content: "Teleprompter — your script by the lens" },
      { property: "og:description", content: "Read naturally while filming yourself. Voice-following script, timed scroll fallback, and takes saved on your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Splash() {
  return <div className="fixed inset-0 flex items-center justify-center bg-background text-2xl font-extrabold text-primary">Teleprompter</div>;
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
