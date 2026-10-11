import { Image } from "lucide-react";
import { useEffect, useState } from "react";

import { loadArtifactPng, type ArtifactPngMetadata } from "./artifactPng.js";

export function RemoteImagePreview({
  name,
  preview
}: {
  name: string;
  preview: ArtifactPngMetadata;
}) {
  const key = `${preview.artifactId}:${preview.originalBytes}:${preview.contentType}`;
  const [state, setState] = useState<{ key: string; url?: string; failed?: boolean }>();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl: string | undefined;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setState({ key });
    void loadArtifactPng(preview, controller.signal)
      .then((blob) => {
        if (!active || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, url: objectUrl });
      })
      .catch(() => {
        if (active) setState({ key, failed: true });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [key, preview.artifactId, preview.contentType, preview.originalBytes]);

  const current = state?.key === key ? state : undefined;
  if (current?.url !== undefined && !current.failed) {
    return (
      <img
        alt={name}
        className="attachment-viewer__media"
        src={current.url}
        onError={() => setState({ key, failed: true })}
      />
    );
  }
  return (
    <div className="attachment-viewer__text-state" role={current?.failed ? "alert" : "status"}>
      <Image aria-hidden="true" size={24} />
      <strong>
        {current?.failed ? "Не удалось загрузить изображение" : "Загружаем изображение…"}
      </strong>
      <span>
        {current?.failed
          ? "Закройте просмотр и попробуйте снова. Проверьте, что у вас есть доступ к вложению."
          : "Изображение появится после загрузки."}
      </span>
    </div>
  );
}
