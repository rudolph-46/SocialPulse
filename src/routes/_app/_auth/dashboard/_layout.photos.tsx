import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/ui/button";
import {
  ImageIcon,
  Upload,
  Trash2,
  Loader2,
  Tag,
  X,
} from "lucide-react";
import { Input } from "@/ui/input";
import siteConfig from "~/site.config";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/photos",
)({
  component: PhotosPage,
  beforeLoad: () => ({
    title: `${siteConfig.siteTitle} - Photos`,
    headerTitle: "Banque photos",
    headerDescription: "Gérez vos photos pour un contenu authentique.",
  }),
});

function PhotosPage() {
  const { data: photos = [] } = useQuery(
    convexQuery(api.photos.listPhotos, {}),
  );
  const generateUploadUrlFn = useConvexMutation(api.photos.generateUploadUrl);
  const uploadPhotoFn = useConvexMutation(api.photos.uploadPhoto);
  const deletePhotoFn = useConvexMutation(api.photos.deletePhoto);
  const updateTagsFn = useConvexMutation(api.photos.updateTags);

  const { mutateAsync: generateUploadUrl } = useMutation({
    mutationFn: generateUploadUrlFn,
  });
  const { mutateAsync: uploadPhoto } = useMutation({
    mutationFn: uploadPhotoFn,
  });
  const { mutateAsync: deletePhoto } = useMutation({
    mutationFn: deletePhotoFn,
  });
  const { mutateAsync: updateTags } = useMutation({
    mutationFn: updateTagsFn,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setIsUploading(true);
      setUploadCount(0);

      const fileArray = Array.from(files).slice(0, 50);
      for (const file of fileArray) {
        if (file.size > 10 * 1024 * 1024) continue;
        if (!file.type.startsWith("image/")) continue;

        try {
          const url = await generateUploadUrl({});
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const storageId = url.split("/").pop()?.split("?")[0];
          if (!storageId) continue;

          // The upload URL returns the storage ID in the response
          const uploadRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          const { storageId: sid } = (await uploadRes.json()) as {
            storageId: string;
          };

          await uploadPhoto({
            storageId: sid as any,
            filename: file.name,
            fileSizeBytes: file.size,
          });
          setUploadCount((c) => c + 1);
        } catch {
          // skip failed uploads
        }
      }
      setIsUploading(false);
    },
    [generateUploadUrl, uploadPhoto],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload],
  );

  const handleSaveTags = async (photoId: string) => {
    const tags = tagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    await updateTags({ photoId: photoId as any, tags });
    setEditingTagsId(null);
    setTagInput("");
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card p-10 text-center transition hover:border-primary/40"
      >
        {isUploading ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-primary/70">
              Upload en cours... {uploadCount} photo(s) envoyée(s)
            </p>
          </div>
        ) : (
          <>
            <Upload className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-lg font-medium text-primary">
              Dépose tes photos ou clique pour choisir
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              JPEG, PNG, WebP — max 10 Mo — jusqu'à 50 photos
            </p>
            <label className="mt-4 cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <Button variant="outline" className="gap-2" asChild>
                <span>
                  <Upload className="h-4 w-4" />
                  Choisir des fichiers
                </span>
              </Button>
            </label>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-primary/60">
          {photos.length} photo{photos.length !== 1 ? "s" : ""} dans la banque
        </p>
        <p className="text-xs text-muted-foreground">
          Quota : {photos.length} / 200
        </p>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-16 text-center">
          <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-primary">
            Aucune photo
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Uploadez vos premières photos pour un contenu plus authentique.
            Les photos réelles consomment 1 crédit au lieu de 2 pour les
            images IA.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(photos as any[]).map((photo) => (
            <div
              key={photo._id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card"
            >
              <img
                src={photo.url}
                alt={photo.filename}
                className="aspect-square w-full object-cover"
              />

              {/* Overlay actions */}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 transition group-hover:opacity-100">
                <div className="flex w-full items-center justify-between p-3">
                  <button
                    type="button"
                    className="rounded-full bg-white/20 p-1.5 text-white hover:bg-white/40"
                    onClick={() => {
                      setEditingTagsId(photo._id);
                      setTagInput(photo.tags?.join(", ") ?? "");
                    }}
                  >
                    <Tag className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-red-500/30 p-1.5 text-white hover:bg-red-500/60"
                    onClick={() => {
                      if (confirm("Supprimer cette photo ?")) {
                        deletePhoto({ photoId: photo._id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="p-3">
                {editingTagsId === photo._id ? (
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="tag1, tag2, tag3"
                      className="h-7 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleSaveTags(photo._id)}
                    >
                      OK
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingTagsId(null)}
                      className="text-primary/40 hover:text-primary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(photo.tags ?? []).length > 0 ? (
                      photo.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs text-primary/70"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Pas de tags
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <p className="truncate text-xs text-muted-foreground">
                    {photo.filename}
                  </p>
                  <span className="text-xs text-primary/50">
                    ×{photo.usedCount}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
