import { redirect } from "next/navigation";

export default function ParishPage({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/p/${params.slug}/form`);
}
