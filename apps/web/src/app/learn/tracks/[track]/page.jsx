import { notFound } from "next/navigation";
import { LearnPage } from "@web/components/learn-page";
import { TRACKS } from "@web/content/web-lessons.mjs";
export function generateStaticParams() {
  return TRACKS.filter((t) => t.id !== "all").map((t) => ({ track: t.id }));
}
export async function generateMetadata({ params }) {
  const { track } = await params;
  return {
    title: TRACKS.find((t) => t.id === track)?.title ?? "Learning path",
  };
}
export default async function Page({ params }) {
  const { track } = await params;
  if (!TRACKS.some((t) => t.id === track && t.id !== "all")) notFound();
  return <LearnPage key={track} initialTrack={track} />;
}
