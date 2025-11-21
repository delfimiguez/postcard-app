// api/send-postcard.js
// FRONT: imagen subida (base64 → JPG buffer)
// BACK: imagen generada desde canvas (base64 → JPG buffer) o HTML fallback

import fetch from 'node-fetch';

let totalSent = 0;
const MAX_SENDS = 300;

export default async function handler(req, res) {
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

  const { image, message, backImage } = req.body || {};

  if (!image || !message) {
    return res.status(400).json({
      error: 'Faltan datos requeridos (imagen o mensaje).'
    });
  }

  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // MODO TEST POR DEFECTO (no manda nada real)
    // const testFlag = process.env.STANNP_TEST_MODE ?? 'true';
    // formData.append('test', testFlag);

    // MODO REAL: envíos de verdad a Stannp
        const testFlag = 'false';
        formData.append('test', testFlag);


    // DESTINATARIO FIJO — CAMBIÁ ESTO A TU DIRECCIÓN REAL
    formData.append('recipient[firstname]', 'Delfina');
    formData.append('recipient[lastname]', 'Miguez');
    formData.append('recipient[address1]', 'Carrer de Provenza, PISO 3 1');
    formData.append('recipient[city]', 'Barcelona');
    formData.append('recipient[postcode]', '08029');
    formData.append('recipient[country]', 'ES');

    // FRONT — imagen subida
    const frontBase64 = image.replace(/^data:image\/\w+;base64,/, '');
    const frontBuffer = Buffer.from(frontBase64, 'base64');

    formData.append('front', frontBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // BACK — si viene backImage (del canvas), la usamos.
    if (backImage) {
      const backBase64 = backImage.replace(/^data:image\/\w+;base64,/, '');
      const backBuffer = Buffer.from(backBase64, 'base64');

      formData.append('back', backBuffer, {
        filename: 'back.jpg',
        contentType: 'image/jpeg'
      });
    } else {
      // Fallback HTML (por si algún día falla el canvas)
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
              color: '#333';
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
    }

    formData.append('size', 'A5');
    formData.append('post_unverified', '1');

    // API KEY
    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta STANNP_API_KEY en Vercel.' });
    }

    // ✅ Pasamos la API key por query string (esto evita el error de "no API key")
    const url = `https://dash.stannp.com/api/v1/postcards/create?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...formData.getHeaders()
      },
      body: formData
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      console.error('Respuesta NO JSON:', rawText);
      return res.status(502).json({
        error: 'Respuesta inesperada de Stannp',
        details: rawText
      });
    }

    if (!response.ok || result.success === false) {
      console.error('Error Stannp:', result);
      return res.status(502).json({
        error: result.error || 'Error al enviar postal a Stannp',
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
  } catch (error) {
    console.error('Error en send-postcard:', error);
    return res.status(500).json({
      error: 'Error al enviar la postal',
      details: error.message
    });
  }
}

