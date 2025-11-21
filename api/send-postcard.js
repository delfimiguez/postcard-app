// api/send-postcard.js
// Envía postales a Stannp usando:
// - FRONT: la imagen que suben en la web
// - BACK: un JPG generado con el texto (mensaje)

import fetch from 'node-fetch';
import FormData from 'form-data';
import Jimp from 'jimp';

let totalSent = 0;
const MAX_SENDS = 300;

// Estimar tamaño de dataURL base64 (para limitar a 5MB)
function getBase64SizeBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return (base64.length * 3) / 4 - padding;
}

// Crear una imagen JPG con el mensaje
async function createBackImage(message) {
  // Tamaño aproximado A5 en orientación horizontal (puede ajustarse)
  const width = 1748;  // ~ A5 landscape 300dpi
  const height = 1240;

  const image = new Jimp(width, height, 0xffffffff); // fondo blanco
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const margin = 80;

  image.print(
    font,
    margin,
    margin,
    {
      text: message,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_TOP
    },
    width - margin * 2,
    height - margin * 2
  );

  const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  return buffer;
}

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (totalSent >= MAX_SENDS) {
    return res.status(403).json({
      error: 'Límite de envíos alcanzado',
      sent: totalSent,
      max: MAX_SENDS
    });
  }

  const { image, message } = req.body || {};

  // Validación básica
  if (!image || !message) {
    return res.status(400).json({
      error: 'Faltan datos requeridos (imagen o mensaje)'
    });
  }

  // Límite de 5MB
  const sizeInBytes = getBase64SizeBytes(image);
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  if (sizeInBytes > MAX_SIZE) {
    return res.status(400).json({
      error: 'La imagen es demasiado grande (máx. 5MB). Probá con una foto más liviana.'
    });
  }

  try {
    // Dirección fija: cambiala acá a tu dirección real
    const recipient = {
      firstname: 'Delfina',
      lastname: 'Miguez',
      address1: 'TU CALLE 123, PISO X',
      city: 'Barcelona',
      postcode: '08001',
      country: 'ES'
    };

    // FRONT: convertir base64 a buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const frontBuffer = Buffer.from(base64Data, 'base64');

    // BACK: generar JPG con el mensaje
    const backBuffer = await createBackImage(message);

    const formData = new FormData();

    // Seguimos en TEST hasta que confirmes PDF
    const testFlag = process.env.STANNP_TEST_MODE ?? 'true';
    formData.append('test', testFlag);

    formData.append('size', 'A5');
    formData.append('post_unverified', '1');

    formData.append('recipient[firstname]', recipient.firstname);
    formData.append('recipient[lastname]', recipient.lastname);
    formData.append('recipient[address1]', recipient.address1);
    formData.append('recipient[city]', recipient.city);
    formData.append('recipient[postcode]', recipient.postcode);
    formData.append('recipient[country]', recipient.country);

    // FRONT: foto subida
    formData.append('front', frontBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // BACK: JPG con el texto
    formData.append('back', backBuffer, {
      filename: 'back.jpg',
      contentType: 'image/jpeg'
    });

    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta STANNP_API_KEY en las variables de entorno.'
      });
    }

    // EU1 cluster, usando api_key en query para evitar problemas de auth
    const url = `https://api-eu1.stannp.com/api/v1/postcards/create?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: formData.getHeaders(),
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('Error Stannp:', result);
      return res.status(400).json({
        error: result.error || 'Error al enviar la postal a Stannp',
        stannpRaw: result
      });
    }

    totalSent++;

    return res.status(200).json({
      success: true,
      message: 'Postal enviada correctamente (modo test)',
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: result.data?.id ?? null,
      stannpRaw: result
    });
  } catch (err) {
    console.error('Error general en send-postcard:', err);
    return res.status(500).json({
      error: 'Error interno al procesar la postal',
      details: err.message
    });
  }
}

