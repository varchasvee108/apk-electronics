import { notFound } from "next/navigation";
import { LessonReader } from "@web/components/lesson-reader";
import { LESSONS, findLesson } from "@web/lib/curriculum";
export function generateStaticParams() {
  return LESSONS.map((l) => ({ id: l.id }));
}
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: findLesson(id)?.title ?? "Lesson" };
}
export default async function Page({ params }) {
  const { id } = await params;
  if (!findLesson(id)) notFound();
  return <LessonReader key={id} id={id} />;
}
