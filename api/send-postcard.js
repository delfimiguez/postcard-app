// api/send-postcard.js
// FRONT: foto subida (base64)
// BACK: PDF generado con el mensaje (base64)
// Endpoint oficial Stannp: https://api-eu1.stannp.com/v1/postcards/create

import fetch from "node-fetch";

let totalSent = 0;
const MAX_SENDS = 300;

// Estimar tamaño del base64 (para el límite de 5MB)
function getBase64SizeBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || dataUrl;
  const padding = (base64.match(/=+$/) || [""])[0].length;
  return (base64.length * 3) / 4 - padding;
}

// Generar PDF A5 simple con el mensaje
async function createBackPdfBase64(message) {
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A5",
      margin: 40,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");
      resolve(base64);
    });
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

  // Validación básica
  if (!image || !message) {
    return res.status(400).json({
      error: "Faltan datos requeridos (imagen o mensaje).",
    });
  }

  // Límite 5MB para la imagen
  const sizeInBytes = getBase64SizeBytes(image);
  const MAX_SIZE = 5 * 1024 * 1024;
  if (sizeInBytes > MAX_SIZE) {
    return res.status(400).json({
      error:
        "La imagen es demasiado grande (máx. 5MB). Probá con una foto más liviana.",
    });
  }

  try {
    // Dirección fija: CAMBIÁ ESTO a tu dirección real
    const recipient = {
      firstname: "Delfina",
      lastname: "Miguez",
      address1: "TU CALLE 123, PISO X",
      city: "Barcelona",
      postcode: "08001",
      country: "ES",
    };

    // FRONT: sacamos solo la parte base64 (sin "data:image/...")
    const frontBase64 = image.split(",")[1] || image;

    // BACK: PDF → base64
    const backBase64 = await createBackPdfBase64(message);

    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Falta STANNP_API_KEY en las variables de entorno.",
      });
    }

    // Modo test por defecto (NO se envía nada real todavía)
    const testFlag = (process.env.STANNP_TEST_MODE ?? "true") === "true";

    // Body JSON según docs oficiales: front/back como base64
    const body = {
      test: testFlag,
      size: "A5",
      front: frontBase64, // base64 string
      back: backBase64,   // base64 string (PDF)
      recipient: {
        firstname: recipient.firstname,
        lastname: recipient.lastname,
        address1: recipient.address1,
        city: recipient.city,
        postcode: recipient.postcode,
        country: recipient.country,
      },
      post_unverified: true,
    };

    // Endpoint correcto oficial:
    const url = "https://api-eu1.stannp.com/v1/postcards/create";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

