// api/send-postcard.js

import fetch from 'node-fetch';

let usedCodes = new Set();
let totalSent = 0;
const MAX_SENDS = 300;

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Verificar límite de envíos
  if (totalSent >= MAX_SENDS) {
    return res.status(403).json({
      error: 'Límite de envíos alcanzado',
      sent: totalSent,
      max: MAX_SENDS
    });
  }

  // 👇 Ya NO usamos address, solo imagen + mensaje
  const { image, message, accessCode } = req.body || {};

  // Validar datos mínimos
  if (!image || !message) {
    return res
      .status(400)
      .json({ error: 'Faltan datos requeridos (imagen o mensaje)' });
  }

  // Opcional: código de acceso
  if (accessCode) {
    if (usedCodes.has(accessCode)) {
      return res.status(403).json({ error: 'Este código ya fue usado' });
    }
    usedCodes.add(accessCode);
  }

  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // Test mode (true/false desde env, o true por defecto)
    formData.append('test', process.env.STANNP_TEST_MODE ?? 'true');

    // 👇 DESTINATARIO FIJO — TODO VA A TU DIRECCIÓN
    const fullName = 'Delfina Miguez';
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');

    formData.append('recipient[firstname]', firstName);
    formData.append('recipient[lastname]', lastName);

    // ⚠️ EDITÁ ESTAS LÍNEAS CON TU DIRECCIÓN REAL
    formData.append('recipient[address1]', 'Carrer de Provenca 36, PISO 3 1');
    formData.append('recipient[city]', 'Barcelona');
    formData.append('recipient[postcode]', '08029');
    formData.append('recipient[country]', 'ES');

    // Imagen frontal (base64 → buffer)
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64, 'base64');
    formData.append('front', imageBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // Reverso con el mensaje
    const backHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Helvetica, Arial, sans-serif;
            padding: 40px;
            margin: 0;
          }
          .message {
            font-size: 14pt;
            line-height: 1.6;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="message">${message}</div>
      </body>
      </html>
    `;

    formData.append('back', Buffer.from(backHtml), {
      filename: 'back.html',
      contentType: 'text/html'
    });

    formData.append('size', 'A5');
    formData.append('post_unverified', '1');

    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      console.error('STANNP_API_KEY no está definida');
      return res
        .status(500)
        .json({ error: 'Configuración del servidor incompleta (API key)' });
    }

    // Endpoint correcto EU1 con api_key en la query
    const response = await fetch(
      `https://api-eu1.stannp.com/api/v1/postcards/create?api_key=${apiKey}`,
      {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData
      }
    );

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      console.error('Respuesta no JSON de Stannp:', rawText);
      return res.status(502).json({
        error: 'Respuesta inesperada de Stannp',
        details: rawText
      });
    }

    if (!response.ok || result.success === false) {
      console.error('Error de Stannp:', result);
      return res.status(502).json({
        error: 'Error al enviar la postal',
        details: result.error || rawText
      });
    }

    totalSent++;

    return res.status(200).json({
      success: true,
      message: 'Postal enviada correctamente',
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: result.data?.id ?? null,
      stannpRaw: result
    });
  } catch (error) {
    console.error('Error en función /api/send-postcard:', error);
    return res.status(500).json({
      error: 'Error al enviar la postal',
      details: error.message
    });
  }
}

