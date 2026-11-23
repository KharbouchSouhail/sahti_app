import { ApiError, handle } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { resolveRecorderSession } from '@/lib/ai/recorder-session';
import { saveRecordingChunk } from '@/lib/recording-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: { sessionId: string; index: string } },
) {
  return handle(async () => {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const session = await resolveRecorderSession(params.sessionId, token);
    if (!session) throw new ApiError('NOT_FOUND', 404);

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid chunk index');
    }

    const recording = await prisma.recording.findUnique({
      where: { id: session.recordingId },
    });
    if (!recording || recording.deletedAt) throw new ApiError('AUDIO_DELETED', 410);
    if (recording.status === 'READY') throw new ApiError('RECORDING_LOCKED', 409);

    const buffer = Buffer.from(await request.arrayBuffer());
    try {
      await saveRecordingChunk(recording.id, index, buffer);
    } catch (error) {
      if (error instanceof Error && error.message === 'CHUNK_TOO_LARGE') {
        throw new ApiError('CHUNK_TOO_LARGE', 413);
      }
      throw error;
    }

    const chunkCount = Math.max(recording.chunkCount, index + 1);
    await prisma.recording.update({
      where: { id: recording.id },
      data: { chunkCount, status: 'UPLOADING' },
    });

    return { index, chunkCount, sizeBytes: buffer.length };
  });
}
