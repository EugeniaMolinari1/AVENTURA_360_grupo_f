const multer = require("multer");

const formatosPermitidos = [
    "image/jpeg",
    "image/png",
    "image/webp",
];

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        if (!formatosPermitidos.includes(file.mimetype)) {
            return cb(
                new Error("Solo se permiten imagenes JPG, JPEG, PNG o WEBP.")
            );
        }

        cb(null, true);
    },
});

module.exports = upload;