// api/send-postcard.js

export default async function handler(req, res) {
  // Log básico para ver qué llega
  console.log('Método:', req.method);

  if (req.method !== 'POST') {
    // Cuando entres por navegador (GET) vas a ver esto:
    return res.status(200).json({
      ok: true,
      message: 'API send-postcard está viva. Usa POST desde el formulario.'
    });
  }

  try {
    let body = req.body;

    // En funciones Node de Vercel a veces req.body viene vacío,
    // así que leemos el stream por las dudas:
    if (!body || Object.keys(body).length === 0) {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }

    console.log('Body recibido:', body);

    const { email, imageUrl, message } = body;

    if (!email || !imageUrl || !message) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos requeridos',
        body
      });
    }

    // 🧪 Por ahora NO mandamos nada a ningún lado.
    // Solo confirmamos que llegó bien.
    return res.status(200).json({
      ok: true,
      message: 'Postal recibida correctamente en el backend',
      received: { email, imageUrl, message }
    });
  } catch (err) {
    console.error('Error en send-postcard:', err);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor'
    });
  }
}
