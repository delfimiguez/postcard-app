// Este archivo maneja el envío de postales de forma segura
import fetch from 'node-fetch';

// Almacenamiento simple en memoria (resetea al reiniciar)
// Para producción, usa una base de datos
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

  const { image, message, address, accessCode } = req.body;

  // Validar que todos los campos estén presentes
  if (!image || !message || !address?.name || !address?.street || !address?.city || !address?.postalCode) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  // Opcional: Verificar código de acceso único
  if (accessCode) {
    if (usedCodes.has(accessCode)) {
      return res.status(403).json({ error: 'Este código ya fue usado' });
    }
    usedCodes.add(accessCode);
  }

  try {
    // Preparar FormData para Stannp
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // Configuración (test mode para pruebas)
    formData.append('test', process.env.STANNP_TEST_MODE || 'true');

    // Datos del destinatario
    formData.append('recipient[firstname]', address.name.split(' ')[0]);
    formData.append('recipient[lastname]', address.name.split(' ').slice(1).join(' ') || '');
    formData.append('recipient[address1]', address.street);
    formData.append('recipient[city]', address.city);
    formData.append('recipient[postcode]', address.postalCode);
    formData.append('recipient[country]', 'ES');

    // Convertir imagen base64 a buffer
    const imageBuffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    formData.append('front', imageBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // Crear HTML para el reverso
    const backHtml = `
      <!DOCTYPE html>
      <html>
      <head>
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

            // Llamar a la API correcta de Stannp
    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      throw new Error('STANNP_API_KEY no está definida en las env vars');
    }

    // Usa el endpoint público de la API (EU por defecto)
    const apiBase = process.env.STANNP_API_BASE || 'https://api-eu1.stannp.com';

    const response = await fetch(`${apiBase}/v1/postcards/create?api_key=${apiKey}`, {
      method: 'POST',
      headers: {
        ...formData.getHeaders()
      },
      body: formData
    });



    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al enviar a Stannp');
    }

    const result = await response.json();
    totalSent++;

    return res.status(200).json({
      success: true,
      message: 'Postal enviada correctamente',
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: result.data?.id
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Error al enviar la postal',
      details: error.message
    });
  }
}
