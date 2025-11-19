// api/send-postcard.js

export default async function handler(req, res) {
  // Para que al abrir la URL en el navegador por GET no rompa
  if (req.method !== 'POST') {
    return res.status(200).json({
      ok: true,
      message: 'API send-postcard está viva. Usa POST desde el formulario.'
    });
  }

  try {
    let body = req.body;

    // En Vercel, a veces req.body viene vacío aunque el JSON esté,
    // así que leemos el stream manualmente por las dudas
    if (!body || (typeof body === 'string' && !body.trim()) || Object.keys(body).length === 0) {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
      }

      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch (err) {
          console.error('Error parseando JSON:', err, 'raw:', raw.slice(0, 200));
          return res.status(400).json({
            ok: false,
            error: 'JSON inválido recibido en el backend'
          });
        }
      } else {
        body = {};
      }
    }

    console.log('📩 Body recibido en send-postcard:', body);

    const { image, message, address } = body || {};

    // Validaciones básicas de lo que manda tu front
    if (!image || !message || !address) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos requeridos (image, message, address)',
        received: body
      });
    }

    if (!address.name || !address.street || !address.city || !address.postalCode) {
      return res.status(400).json({
        ok: false,
        error: 'La dirección está incompleta',
        received: address
      });
    }

    // 👉 IMPORTANTE:
    // Aquí ANTES llamabas a alguna API externa que ahora da el error de API key.
    // La quitamos para que la demo funcione.
    // Si después quieres integrar un servicio real, lo añadimos de nuevo
    // leyendo la API key desde process.env.MI_API_KEY.

    return res.status(200).json({
      ok: true,
      message: 'Postal recibida correctamente en el backend (demo)',
      received: {
        hasImage: !!image,
        message,
        address
      }
    });

  } catch (err) {
    console.error('🚨 Error inesperado en send-postcard:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor en send-postcard'
    });
  }
}
