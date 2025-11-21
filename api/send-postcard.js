// api/send-postcard.js

import fetch from 'node-fetch';
import FormData from 'form-data';
import PDFDocument from 'pdfkit';

// Helper: crear un PDF sencillo con el mensaje
function createBackPdf(message) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A5',     // coincide con size = "A5" de Stannp
      margin: 40
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Estilo simple, pero se puede tunear
    doc.fontSize(18).text('Mensaje:', { bold: true });
    doc.moveDown();
    doc.fontSize(14).text(message, {
      align: 'left',
      lineGap: 4
    });

    doc.end();
  });
}

let totalSent = 0;
const MAX_SENDS = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { image, message } = req.body || {};

  // Validaciones básicas
  if (!image || !message) {
    return res.status(400).json({
      error: 'Faltan datos requeridos (imagen o mensaje)'
    });
  }

  // Decodificar imagen base64 y chequear tamaño
  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    if (imageBuffer.length > MAX_BYTES) {
      return res.status(400).json({
        error: 'La imagen es demasiado grande (máx. 5 MB). Probá con una foto más liviana.'
      });
    }

    if (totalSent >= MAX_SENDS) {
      return res.status(403).json({
        error: 'Límite de envíos alcanzado',
        sent: totalSent,
        max: MAX_SENDS
      });
    }

    // Crear el PDF del reverso con el mensaje
    const backPdfBuffer = await createBackPdf(message);

    // Armar cuerpo para Stannp
    const formData = new FormData();

    // MODO TEST: sigue activo hasta que lo cambiemos
    formData.append('test', process.env.STANNP_TEST_MODE ?? 'true');
    formData.append('size', 'A5');

    // Dirección fija (tu dirección en BCN)
    formData.append('recipient[firstname]', 'Delfina');
    formData.append('recipient[lastname]', 'Miguez');
    formData.append('recipient[address1]', 'TU CALLE Y NÚMERO');
    formData.append('recipient[city]', 'Barcelona');
    formData.append('recipient[postcode]', '08000'); // cambia por tu CP real
    formData.append('recipient[country]', 'ES');

    // FRONT: imagen subida por la usuaria
    formData.append('front', imageBuffer, {
      filename: 'front.jpg',
      contentType: 'image/jpeg'
    });

    // BACK: PDF con el mensaje
    formData.append('back', backPdfBuffer, {
      filename: 'back.pdf',
      contentType: 'application/pdf'
    });

    const stannpResponse = await fetch(
      'https://api-eu1.stannp.com/v1/postcards/create',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STANNP_API_KEY}`,
          ...formData.getHeaders()
        },
        body: formData
      }
    );

    const result = await stannpResponse.json();

    if (!stannpResponse.ok || !result.success) {
      console.error('Error Stannp:', result);
      return res.status(400).json({
        error: 'Error al enviar la postal a Stannp',
        stannp: result
      });
    }

    totalSent += 1;

    return res.status(200).json({
      success: true,
      message: 'Postal enviada correctamente',
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

