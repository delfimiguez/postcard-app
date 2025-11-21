// api/send-postcard.js
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

  const { image, backImage } = req.body || {};

  if (!image || !backImage) {
    return res.status(400).json({
      error: 'Faltan datos requeridos (image o backImage).'
    });
  }

  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // ⚠️ POR AHORA: sólo modo TEST (no se manda de verdad)
    // cambia a 'false' cuando esté todo OK
    formData.append('test', 'true');

    // Dirección fija (cámbiala a la tuya real si hace falta)
    formData.append('recipient[firstname]', 'Delfina');
    formData.append('recipient[lastname]', 'Miguez');
    formData.append('recipient[address1]', 'Carrer de Provenca 36, PISO 3 1');
    formData.append('recipient[city]', 'Barcelona');
    formData.append('recipient[postcode]', '08029');
    formData.append('recipient[country]', 'ES');

    // FRONT (imagen subida)
    const frontBase64 = image.replace(/^data:image\/\w+;base64,/, '');
    const frontBuffer = Buffer.from(frontBase64, 'base64');

    formData.append('front', frontBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // BACK (imagen generada desde canvas con el texto)
    const backBase64 = backImage.replace(/^data:image\/\w+;base64,/, '');
    const backBuffer = Buffer.from(backBase64, 'base64');

    formData.append('back', backBuffer, {
      filename: 'back.jpg',
      contentType: 'image/jpeg'
    });

    formData.append('size', 'A5');
    formData.append('post_unverified', '1');

    // ---------- API KEY ----------
    const apiKey = process.env.STANNP_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta STANNP_API_KEY en Vercel'
      });
    }

    const url = `https://dash.stannp.com/api/v1/postcards/create?api_key=${encodeURIComponent(
      apiKey
    )}`;

    const response = await fetch(url, {
      method: 'POST',
      body: formData
    });

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch (e) {
      // Si Stannp devuelve HTML o algo raro, lo vemos tal cual
      return res.status(502).json({
        error: 'Respuesta inesperada de Stannp (no es JSON)',
        raw
      });
    }

    if (!response.ok || data.success === false) {
      return res.status(502).json({
        error: data.error || 'Error devuelto por Stannp',
        stannpRaw: data
      });
    }

    totalSent++;

    return res.status(200).json({
      success: true,
      message: 'Postal enviada correctamente (modo test)',
      sent: totalSent,
      remaining: MAX_SENDS - totalSent,
      stannpId: data.data?.id ?? null,
      stannpRaw: data
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al enviar la postal',
      details: error.message
    });
  }
}

