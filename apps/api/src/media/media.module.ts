import { createHmac } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { CloudinaryMediaAdapter } from './cloudinary-media.adapter';
import { LocalMediaAdapter } from './local-media.adapter';
import { MediaUploadController } from './media-upload.controller';
import { MEDIA_PROVIDER, type MediaProvider } from './media-provider';

@Global()
@Module({
  controllers: [MediaUploadController],
  providers: [
    {
      provide: MEDIA_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): MediaProvider =>
        env.MEDIA_PROVIDER === 'cloudinary'
          ? new CloudinaryMediaAdapter({
              cloudName: env.CLOUDINARY_CLOUD_NAME,
              apiKey: env.CLOUDINARY_API_KEY,
              apiSecret: env.CLOUDINARY_API_SECRET,
            })
          : new LocalMediaAdapter(env.MEDIA_BASE_URL, {
              uploadUrl: env.MEDIA_UPLOAD_URL,
              secret: createHmac('sha256', env.JWT_SECRET).update('media-upload').digest('hex'),
            }),
    },
  ],
  exports: [MEDIA_PROVIDER],
})
export class MediaModule {}
