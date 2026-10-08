import { useEffect, useRef, useState } from "react";
import { apiError } from "../api/client";
import { deleteImage, listImages, uploadImage, type UploadedImage } from "../api/images";
import type { StaticArea } from "../board/layout";

const FITS: { value: NonNullable<StaticArea["fit"]>; label: string }[] = [
  { value: "contain", label: "Show all of it" },
  { value: "cover", label: "Fill, cropping the edges" },
  { value: "fill", label: "Stretch to fit" },
];

/**
 * The board's static areas, edited with controls rather than in the layout's JSON: where each
 * one is, and the image it shows (uploaded here, chosen from earlier uploads, or by address).
 */
export function StaticAreasPanel({ statics, onChange }: { statics: StaticArea[]; onChange: (statics: StaticArea[]) => void }) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [newId, setNewId] = useState("");
  const [newArea, setNewArea] = useState("");

  const refresh = () =>
    listImages()
      .then(setImages)
      .catch(() => setImages([]));
  useEffect(() => {
    refresh();
  }, []);

  const update = (i: number, patch: Partial<StaticArea>) =>
    onChange(statics.map((s, j) => (j === i ? withoutEmpty({ ...s, ...patch }) : s)));

  const upload = async (i: number, file: File) => {
    setNotice(null);
    try {
      const res = await uploadImage(file);
      update(i, { image: res.data.url });
      setNotice({ kind: "ok", text: `"${res.data.name}" uploaded.` });
      refresh();
    } catch (e) {
      setNotice({ kind: "error", text: apiError(e).message });
    }
  };

  const removeImage = async (image: UploadedImage) => {
    setNotice(null);
    try {
      await deleteImage(image.id);
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status !== 409 || !window.confirm(apiError(e).message)) {
        if (status !== 409) setNotice({ kind: "error", text: apiError(e).message });
        return;
      }
      await deleteImage(image.id, true).catch((err) => setNotice({ kind: "error", text: apiError(err).message }));
    }
    refresh();
  };

  const add = () => {
    const id = newId.trim();
    if (!id || !newArea.trim()) return;
    onChange([...statics, { id, area: newArea.trim() }]);
    setNewId("");
    setNewArea("");
  };

  return (
    <fieldset className="wide static-panel">
      <legend>Static areas</legend>
      {statics.length === 0 && <p className="hint">None yet. Add one below to show a logo or other image.</p>}

      {statics.map((s, i) => (
        <div className="static-row" key={i}>
          <div className="static-preview" style={{ background: s.background ?? "#161618" }}>
            {s.image ? <img src={s.image} alt="" style={{ objectFit: s.fit ?? "contain" }} /> : <span className="hint">no image</span>}
          </div>
          <div className="static-controls">
            <div className="row-editor">
              <input value={s.id} onChange={(e) => update(i, { id: e.target.value })} aria-label="Name" size={10} />
              <input value={s.area} onChange={(e) => update(i, { area: e.target.value })} aria-label="Area" size={12} placeholder="0,0 to 3,3" />
              <button className="icon" title="Remove this static area" onClick={() => onChange(statics.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <ImageChooser image={s.image} images={images} onChoose={(image) => update(i, { image })} onUpload={(file) => upload(i, file)} />
            <div className="row-editor">
              <select value={s.fit ?? "contain"} onChange={(e) => update(i, { fit: e.target.value as StaticArea["fit"] })} aria-label="Fit">
                {FITS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <label className="inline">
                Padding
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={s.padding ?? 0}
                  onChange={(e) => update(i, { padding: Number(e.target.value) || undefined })}
                  style={{ width: 64 }}
                />
              </label>
              <label className="inline">
                Background
                <input type="color" value={s.background ?? "#161618"} onChange={(e) => update(i, { background: e.target.value })} />
              </label>
              {s.background && (
                <button className="icon" title="Back to the board's own panel colour" onClick={() => update(i, { background: undefined })}>
                  ↺
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="row-editor">
        <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="Name, e.g. logo" size={14} />
        <input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="Area, e.g. 0,0 to 3,3" size={18} />
        <button onClick={add} disabled={!newId.trim() || !newArea.trim()}>
          + Add a static area
        </button>
      </div>

      {notice && <p className={`notice ${notice.kind}`}>{notice.text}</p>}

      {images.length > 0 && (
        <details className="image-library">
          <summary>Uploaded images ({images.length})</summary>
          <ul>
            {images.map((image) => (
              <li key={image.id}>
                <img src={image.url} alt="" />
                <span>
                  {image.name}
                  <span className="hint">
                    {" "}
                    {Math.ceil(image.size / 1024)} KB · {image.boards?.length ? `on ${image.boards.join(", ")}` : "not on any board"}
                  </span>
                </span>
                <button className="icon" title="Remove this image" onClick={() => removeImage(image)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  );
}

/** Choose a static area's image: an upload, an earlier upload, or any web address. */
function ImageChooser({
  image,
  images,
  onChoose,
  onUpload,
}: {
  image?: string;
  images: UploadedImage[];
  onChoose: (image: string | undefined) => void;
  onUpload: (file: File) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploaded = images.find((i) => i.url === image);
  const [byAddress, setByAddress] = useState(!!image && !uploaded && !image.startsWith("/images/"));

  return (
    <div className="row-editor">
      <select
        value={byAddress ? "__address__" : (image ?? "")}
        onChange={(e) => {
          if (e.target.value === "__address__") {
            setByAddress(true);
          } else {
            setByAddress(false);
            onChoose(e.target.value || undefined);
          }
        }}
        aria-label="Image"
      >
        <option value="">No image</option>
        {images.map((i) => (
          <option key={i.id} value={i.url}>
            {i.name}
          </option>
        ))}
        {image && !uploaded && !byAddress && <option value={image}>{image}</option>}
        <option value="__address__">A web address…</option>
      </select>
      {byAddress && (
        <input value={image ?? ""} onChange={(e) => onChoose(e.target.value || undefined)} placeholder="https://…/logo.png" size={28} />
      )}
      <button onClick={() => fileInput.current?.click()}>Upload…</button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Leave settings that have been cleared out of the layout, rather than saving them empty. */
function withoutEmpty(s: StaticArea): StaticArea {
  const out = { ...s } as Record<string, unknown>;
  for (const key of ["image", "fit", "padding", "background"]) {
    if (out[key] === undefined || out[key] === "") delete out[key];
  }
  return out as unknown as StaticArea;
}
