// api/send-postcard.js
// FRONT: foto que suben (JPEG)
// BACK: PDF generado con el mensaje

import fetch from "node-fetch";

let totalSent = 0;
const MAX_SENDS = 300;

// Helper para estimar tamaño del base64 (límite 5MB)
function getBase64SizeBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || dataUrl;
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return (base64.length * 3) / 4 - padding;
}

// Genera un PDF A5 simple con el mensaje
async function createBackPdf(message) {
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A5",
      margin: 40,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Mensaje:", { underline: false });
    doc.moveDown();
    doc.fontSize(14).text(message, {
      align: "left",
      lineGap: 4,
    });

    doc.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (totalSent >= MAX_SENDS) {
    return res.status(403).json({
      error: "Límite de envíos alcanzado",
      sent: totalSent,
      max: MAX_SENDS,
    });
  }

  const { image, message } = req.body || {};

  // Validaciones básicas
  if (!image || !message) {
    return res.status(400).json({
      error: "Faltan datos requeridos (imagen o mensaje).",
    });
  }

  // Límite de 5MB
  const sizeInBytes = getBase64SizeBytes(image);
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (sizeInBytes > MAX_SIZE) {
    return res.status(400).json({
      error:
        "La imagen es demasiado grande (máx. 5MB). Probá con una foto más liviana.",
    });
  }

  try {
    // Dirección fija: EDITÁ ESTO con tu dirección real
    const recipient = {
      firstname: "Delfina",
      lastname: "Miguez",
      address1: "TU CALLE 123, PISO X",
      city: "Barcelona",
      postcode: "08001",
      country: "ES",
    };

    // FRONT: convertir base64 a buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const frontBuffer = Buffer.from(base64Data, "base64");

    // BACK: PDF con el mensaje
    const backPdfBuffer = await createBackPdf(message);

    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // ⛑ SEGUIMOS EN MODO TEST
    const testFlag = process.env.STANNP_TEST_MODE ?? "true";
    formData.append("test", testFlag);

    formData.append("size", "A5");
    formData.append("post_unverified", "1");

    formData.append("recipient[firstname]", recipient.firstname);
    formData.append("recipient[lastname]", recipient.lastname);
    formData.append("recipient[address1]", recipient.address1);
    formData.append("recipient[city]", recipient.city);
    formData.append("recipient[postcode]", recipient.postcode);
    formData.append("recipient[country]", recipient.country);

    // FRONT: foto
    formData.append("front", frontBuffer, {
      filename: "front.jpg",
      contentType: "image/jpeg",
    });

    // BACK: PDF con el texto
    formData.append("back", backPdfBuffer, {
      filename: "back.pdf",
      contentType: "application/pdf",
    });

    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Falta STANNP_API_KEY en las variables de entorno.",
      });
    }

    // Endpoint EU1 correcto con api_key en query (esto te había funcionado)
    const url = `https://api-eu1.stannp.com/api/v1/postcards/create?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: formData.getHeaders(),
      body: formData,
    });

    const resultText = await response.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error("Respuesta no JSON de Stannp:", resultText);
      return res.status(502).json({
        error: "Respuesta inesperada de Stannp",
        details: resultText,
      });
    }

    if (!response.ok || !result.success) {
      console.error("Error Stannp:", result);
      return res.status(400).json({
        error: result.error || "Error al enviar la postal a Stannp",
        stannpRaw: result,
      });
    }

    totalSent++;

    return res.status(200).json({
      success: true,
      message: "Postal enviada correctamente (modo test)",
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: result.data?.id ?? null,
      stannpRaw: result,
    });
  } catch (err) {
    console.error("Error general en send-postcard:", err);
    return res.status(500).json({
      error: "Error interno al procesar la postal",
      details: err.message,
    });
  }
}

