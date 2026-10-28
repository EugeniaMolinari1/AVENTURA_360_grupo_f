const cloudinary = require("../config/cloudinary");

function subirImagen(buffer) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "aventura360/productos",
                resource_type: "image",
            },
            (error, resultado) => {
                if (error) {
                    return reject(error);
                }

                resolve({
                    url: resultado.secure_url,
                    public_id: resultado.public_id,
                });
            }
        );

        stream.end(buffer);
    });
}

async function eliminarImagen(publicId) {
    await cloudinary.uploader.destroy(publicId);
}

module.exports = {
    subirImagen,
    eliminarImagen,
};
