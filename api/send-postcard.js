// api/send-postcard.js
// Versión simple que TENÍAS funcionando: front = imagen, back = HTML
import fetch from 'node-fetch';

// Contador simple en memoria
let totalSent = 0;
const MAX_SENDS = 300;

export default async function handler(req, res) {
  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Límite de seguridad
  if (totalSent >= MAX_SENDS) {
    return res.status(403).json({
      error: 'Límite de envíos alcanzado',
      sent: totalSent,
      max: MAX_SENDS
    });
  }

  const { image, message, backImage } = req.body || {};


  // Validación básica: solo imagen + mensaje (ya no pedimos address del front)
  if (!image || !message) {
    return res.status(400).json({
      error: 'Faltan datos requeridos (imagen o mensaje).'
    });
  }

  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // Modo test: dejamos 'true' por defecto hasta que vos decidas cambiarlo
    const testFlag = process.env.STANNP_TEST_MODE ?? 'true';
    formData.append('test', testFlag);

    // ===== DESTINATARIO FIJO: SIEMPRE VOS =====
    const fullName = process.env.RECIPIENT_NAME || 'Delfina Miguez';
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');

    const street = process.env.RECIPIENT_STREET || 'TU CALLE 123, PISO X';
    const city = process.env.RECIPIENT_CITY || 'Barcelona';
    const postcode = process.env.RECIPIENT_POSTCODE || '08001';

    formData.append('recipient[firstname]', firstName);
    formData.append('recipient[lastname]', lastName);
    formData.append('recipient[address1]', street);
    formData.append('recipient[city]', city);
    formData.append('recipient[postcode]', postcode);
    formData.append('recipient[country]', 'ES');

    // ===== FRONT: la imagen subida (base64 → buffer) =====
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64, 'base64');

    formData.append('front', imageBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // ===== BACK: HTML con el mensaje (como antes) =====
    // Si viene una imagen de reverso desde el front, la usamos.
// Si no, usamos el HTML actual como fallback.
if (backImage) {
  const backBase64 = backImage.replace(/^data:image\/\w+;base64,/, '');
  const backBuffer = Buffer.from(backBase64, 'base64');

  formData.append('back', backBuffer, {
    filename: 'back.jpg',
    contentType: 'image/jpeg'
  });
} else {
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
}


    formData.append('size', 'A5');
    formData.append('post_unverified', '1');

    // ===== API KEY Y LLAMADA A STANNP =====
    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta STANNP_API_KEY en las variables de entorno.'
      });
    }

    // Este endpoint + api_key en query es el que te estaba funcionando
    const url = `https://api-eu1.stannp.com/api/v1/postcards/create?api_key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: formData.getHeaders(),
      body: formData
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      console.error('Respuesta no JSON de Stannp:', rawText);
      return res.status(502).json({
        error: 'Respuesta inesperada de Stannp',
        details: rawText
      });
    }

    if (!response.ok || result.success === false) {
      console.error('Error Stannp:', result);
      return res.status(502).json({
        error: 'Error al enviar la postal a Stannp',
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
    console.error('Error en /api/send-postcard:', error);
    return res.status(500).json({
      error: 'Error al enviar la postal',
      details: error.message
    });
  }
}

