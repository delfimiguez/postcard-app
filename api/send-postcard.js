// api/send-postcard.js
// Maneja el envío de postales a través de Stannp

import fetch from "node-fetch";

let usedCodes = new Set();
let totalSent = 0;
const MAX_SENDS = 300;

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Verificar límite simple de envíos
  if (totalSent >= MAX_SENDS) {
    return res.status(403).json({
      error: "Límite de envíos alcanzado",
      sent: totalSent,
      max: MAX_SENDS,
    });
  }

  const { image, message, accessCode } = req.body || {};

  // Validar datos mínimos
  if (!image || !message) {
    return res
      .status(400)
      .json({ error: "Faltan datos requeridos (imagen o mensaje)" });
  }

  // Validar tamaño aproximado de la imagen (máx 5MB)
  // La imagen viene como data URL base64: "data:image/jpeg;base64,...."
  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const sizeInBytes = (base64Data.length * 3) / 4; // aproximación estándar
    const maxBytes = 5 * 1024 * 1024; // 5 MB

    if (sizeInBytes > maxBytes) {
      return res.status(400).json({
        error: "La imagen es demasiado grande (máx. 5MB). Probá con otra más liviana.",
      });
    }
  } catch {
    // Si algo falla al calcular el tamaño, seguimos, pero ya validamos más arriba que haya imagen
  }

  // Opcional: código de acceso único
  if (accessCode) {
    if (usedCodes.has(accessCode)) {
      return res.status(403).json({ error: "Este código ya fue usado" });
    }
    usedCodes.add(accessCode);
  }

  try {
    const FormData = (await import("form-data")).default;
    const formData = new FormData();

    // Test mode: por defecto "false" para que se envíe de verdad
    const testFlag = process.env.STANNP_TEST_MODE ?? "false";
    formData.append("test", testFlag);

    // ===== DATOS DEL DESTINATARIO (FIJOS HACIA VOS) =====
    // Configuralos como variables de entorno en Vercel para mayor comodidad.
    const recipientName = process.env.RECIPIENT_NAME || "Delfina Miguez";
    const recipientStreet =
      process.env.RECIPIENT_STREET || "TU CALLE 123, PISO X";
    const recipientCity = process.env.RECIPIENT_CITY || "Barcelona";
    const recipientPostcode = process.env.RECIPIENT_POSTCODE || "080XX";

    const [firstName, ...rest] = recipientName.split(" ");
    const lastName = rest.join(" ");

    formData.append("recipient[firstname]", firstName);
    formData.append("recipient[lastname]", lastName);
    formData.append("recipient[address1]", recipientStreet);
    formData.append("recipient[city]", recipientCity);
    formData.append("recipient[postcode]", recipientPostcode);
    formData.append("recipient[country]", "ES"); // España

    // ===== IMAGEN FRONTAL =====
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64, "base64");

    formData.append("front", imageBuffer, {
      filename: "front.jpg",
      contentType: "image/jpeg",
    });

    // ===== TEMPLATE PARA EL MENSAJE EN EL REVERSO =====
    // Crea un template de postcard en Stannp y usá {{message}} en el texto.
    // Definí STANNP_TEMPLATE_ID en Vercel (Settings → Environment Variables).
    const templateId = process.env.STANNP_TEMPLATE_ID || "TU_TEMPLATE_ID_AQUÍ";
    formData.append("template", templateId);

    // Pasamos el mensaje como campo custom del destinatario
    // En el template podés usar {{message}} para mostrarlo.
    formData.append("recipient[message]", message);

    // Tamaño de la postal
    formData.append("size", "A5");
    formData.append("post_unverified", "1");

    // ===== CONFIGURACIÓN DE LA API STANNP =====
    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      console.error("STANNP_API_KEY no está definida");
      return res.status(500).json({
        error: "Configuración del servidor incompleta (falta STANNP_API_KEY).",
      });
    }

    const apiBase = process.env.STANNP_API_BASE || "https://api-eu1.stannp.com";

    const response = await fetch(
      `${apiBase}/api/v1/postcards/create?api_key=${apiKey}`,
      {
        method: "POST",
        headers: formData.getHeaders(),
        body: formData,
      }
    );

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      console.error("Respuesta no JSON de Stannp:", rawText);
      return res.status(502).json({
        error: "Respuesta inesperada de Stannp",
        details: rawText,
      });
    }

    if (!response.ok || result.success === false) {
      console.error("Error de Stannp:", result);
      return res.status(502).json({
        error: "Error al enviar la postal",
        details: result.error || rawText,
      });
    }

    totalSent++;

    return res.status(200).json({
      success: true,
      message: "Postal enviada correctamente",
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: result.data?.id ?? null,
      status: result.data?.status ?? null,
      cost: result.data?.cost ?? null,
      pdf: result.data?.pdf ?? null, // por si querés previsualizar
      stannpRaw: result,
    });
  } catch (error) {
    console.error("Error en función /api/send-postcard:", error);
    return res.status(500).json({
      error: "Error al enviar la postal",
      details: error.message,
    });
  }
}
