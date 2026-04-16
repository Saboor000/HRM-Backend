import multer from "multer";

const storage = multer.memoryStorage();

const FILE_SIZE_LIMIT = 5 * 1024 * 1024;

const fileTypeByField = {
  cnic: ["application/pdf", "image/jpeg", "image/png"],
  degree: ["application/pdf", "image/jpeg", "image/png"],
  passport: ["application/pdf", "image/jpeg", "image/png"],
  profilePic: ["image/jpeg", "image/png", "image/webp"],
  contract: ["application/pdf"],
  otherDocs: ["application/pdf", "image/jpeg", "image/png"],
};

const fileFilter = (req, file, cb) => {
  void req;
  const allowedTypes = fileTypeByField[file.fieldname];

  if (!allowedTypes) return cb(new Error(`Unexpected file field: ${file.fieldname}`));
  if (!allowedTypes.includes(file.mimetype)) return cb(new Error(`Invalid file type for ${file.fieldname}`));

  return cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMIT,
    files: 10,
  },
});