import {
  CallHandler,
  Controller,
  ExecutionContext,
  HttpCode,
  Inject,
  Injectable,
  NestInterceptor,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import multer from 'multer';
import { apiError } from '../common/api-error';
import { Public } from '../modules/auth/roles.decorator';
import { LocalMediaAdapter } from './local-media.adapter';
import { acceptUpload } from './local-upload';
import { MAX_UPLOAD_BYTES, MEDIA_PROVIDER, type MediaProvider } from './media-provider';

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, parts: 12, fieldSize: 1024 },
}).single('file');

/** Analyse du multipart ; toute erreur du parseur devient un 400 au format commun. */
@Injectable()
class MultipartInterceptor implements NestInterceptor {
  async intercept(ctx: ExecutionContext, next: CallHandler) {
    const http = ctx.switchToHttp();
    await new Promise<void>((resolve, reject) => {
      parser(http.getRequest<Request>(), http.getResponse<Response>(), (err?: unknown) => {
        if (!err) return resolve();
        const code = (err as { code?: string }).code;
        reject(
          code === 'LIMIT_FILE_SIZE'
            ? apiError(400, 'VALIDATION_FAILED', 'Fichier trop volumineux.', {
                reasons: ['FILE_TOO_LARGE'],
              })
            : apiError(400, 'VALIDATION_FAILED', 'Envoi multipart invalide.', {
                reasons: ['MULTIPART_INVALID'],
              }),
        );
      });
    });
    return next.handle();
  }
}

type UploadedFile = { buffer: Buffer };

/**
 * Réception des uploads de l'adaptateur local (dev, recette). L'autorité est la signature
 * émise par POST /admin/media/upload-signature, comme avec Cloudinary : le navigateur
 * n'envoie pas de jeton ; seul un admin authentifié peut obtenir une signature.
 */
@ApiExcludeController()
@Controller('admin/media')
export class MediaUploadController {
  constructor(@Inject(MEDIA_PROVIDER) private readonly media: MediaProvider) {}

  @Public()
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(MultipartInterceptor)
  async upload(@Req() req: Request & { file?: UploadedFile }) {
    if (!(this.media instanceof LocalMediaAdapter)) {
      throw apiError(404, 'NOT_FOUND', 'Ressource introuvable.');
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);
    const r = acceptUpload(
      {
        apiKey: str('api_key'),
        timestamp: str('timestamp'),
        signature: str('signature'),
        publicId: str('public_id'),
        folder: str('folder'),
      },
      req.file?.buffer,
      this.media.secret,
    );
    await this.media.putObject(r.public_id, r.data, r.contentType);
    return {
      public_id: r.public_id,
      format: r.format,
      bytes: r.bytes,
      ...(r.width > 0 && { width: r.width, height: r.height }),
    };
  }
}
