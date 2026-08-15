import { handleUpload } from '@vercel/blob/client';

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 * 1024; // 5 TB

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[Vercel Blob] Missing BLOB_READ_WRITE_TOKEN');
    return response.status(500).json({
      error: 'BLOB_READ_WRITE_TOKEN não está configurado na Vercel.'
    });
  }

  try {
    const body = await request.json();

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        const cleanPath = String(pathname || '');

        if (!cleanPath.startsWith('episodes/')) {
          throw new Error('Invalid upload path');
        }

        let payload = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch (_) {}

        const safeName = String(payload.fileName || cleanPath.split('/').pop() || 'episode.mp4')
          .replace(/[^a-zA-Z0-9._-]/g, '_');

        return {
          pathname: `episodes/${cleanPath.slice('episodes/'.length).replace(/[^a-zA-Z0-9._/-]/g, '_')}`,
          allowedContentTypes: ['video/mp4', 'video/*', 'application/octet-stream'],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          multipart: !!multipart,
          tokenPayload: JSON.stringify({
            episodeId: String(payload.episodeId || ''),
            fileName: safeName
          })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('[Vercel Blob] Episode upload completed:', {
          url: blob?.url,
          pathname: blob?.pathname,
          tokenPayload
        });
      }
    });

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error('[Vercel Blob] Upload handler error:', error);
    return response.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
