import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  if (request.method === 'GET') {
    return response.status(200).json({ ok: true, service: 'vercel-blob-client-upload' });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel Pages API routes parse JSON into request.body.
    // The Blob client sends the token-exchange payload as JSON.
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return response.status(400).json({ error: 'Pedido de upload inválido.' });
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!String(pathname || '').startsWith('episodes/')) {
          throw new Error('Caminho de upload inválido.');
        }

        return {
          allowedContentTypes: ['video/mp4'],
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            pathname,
            multipart: !!multipart,
            clientPayload: clientPayload || ''
          })
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[Blob] Upload concluído:', blob?.url || blob?.pathname);
      }
    });

    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error('[Blob] Upload error:', error);
    return response.status(400).json({
      error: error?.message || 'Falha no upload para o Vercel Blob.'
    });
  }
}
