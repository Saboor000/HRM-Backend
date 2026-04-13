import { supabase } from "../config/supabase.js";
import { v4 as uuidv4 } from "uuid";

const allowedFolders = new Set([
  "cnic",
  "degree",
  "passport",
  "profile",
  "contract",
  "other",
]);

const sanitizeFileName = (name = "file") => {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
};

export const uploadFile = async (file, folder) => {
  if (!file?.buffer) {
    throw new Error("Invalid file upload payload");
  }

  if (!allowedFolders.has(folder)) {
    throw new Error("Invalid upload folder");
  }

  const fileName = `${folder}/${uuidv4()}-${sanitizeFileName(file.originalname)}`;

  const { data, error } = await supabase.storage
    .from("hrms-files")
    .upload(fileName, file.buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

  if (error) throw error;

  const { data: publicUrl } = supabase.storage
    .from("hrms-files")
    .getPublicUrl(fileName);

  return publicUrl.publicUrl;
};