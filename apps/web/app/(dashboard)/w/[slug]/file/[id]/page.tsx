import { FileViewer } from "@/components/file-viewer";

export default async function FilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FileViewer fileId={id} />;
}
