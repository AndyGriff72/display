import { api, type ApiResponse } from "./client";

export interface UploadedImage {
  id: number;
  uuid: string;
  name: string;
  mime: string;
  size: number;
  /** The address a layout uses for it: /images/{uuid}. */
  url: string;
  /** Names of the boards showing it (in the list only). */
  boards?: string[];
}

export async function listImages(): Promise<UploadedImage[]> {
  const { data } = await api.get<ApiResponse<UploadedImage[]>>("/images");
  return data.data;
}

export async function uploadImage(file: File): Promise<ApiResponse<UploadedImage>> {
  const form = new FormData();
  form.append("image", file);
  const { data } = await api.post("/images", form);
  return data;
}

/** Remove an image. One a board shows is refused (409) unless `force` is set. */
export async function deleteImage(id: number, force = false): Promise<ApiResponse<null>> {
  const { data } = await api.delete(`/images/${id}`, { params: force ? { force: 1 } : undefined });
  return data;
}
