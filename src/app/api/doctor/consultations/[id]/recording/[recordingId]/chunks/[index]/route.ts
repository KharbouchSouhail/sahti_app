import { ApiError, handle, requireUser } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { currentDoctor } from '@/lib/roles';
import { ownedConsultation } from '@/lib/ai/access';
import { saveRecordingChunk } from '@/lib/recording-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: Request,
  { params }: { params: { id: string; recordingId: string; index: string } },
) {
  return handle(async () => {
    const session = await requireUser('DOCTOR');
    const doctor = await currentDoctor(session.user.id);
    await ownedConsultation(params.id, doctor.id);

    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid chunk index');
    }

    const recording = await prisma.recording.findFirst({
      where: { id: params.recordingId, consultationId: params.id },
    });
    if (!recording) throw new ApiError('NOT_FOUND', 404);
    if (recording.deletedAt) throw new ApiError('AUDIO_DELETED', 410);
    if (recording.status === 'READY') throw new ApiError('RECORDING_LOCKED', 409);

    const buffer = Buffer.from(await request.arrayBuffer());
    try {
      await saveRecordingChunk(recording.id, index, buffer);
    } catch (error) {
      if (error instanceof Error && error.message === 'CHUNK_TOO_LARGE') {
        throw new ApiError('CHUNK_TOO_LARGE', 413);
      }
      if (error instanceof Error && error.message === 'EMPTY_CHUNK') {
        throw new ApiError('VALIDATION', 422, 'Empty chunk');
      }
      throw error;
    }

    const chunkCount = Math.max(recording.chunkCount, index + 1);
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        chunkCount,
        status: recording.status === 'RECORDING' ? 'RECORDING' : 'UPLOADING',
      },
    });

    return { index, chunkCount, sizeBytes: buffer.length };
  });
}
