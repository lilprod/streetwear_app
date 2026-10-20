import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { CloudinaryMediaAdapter } from './cloudinary-media.adapter';
import { LocalMediaAdapter } from './local-media.adapter';
import { MEDIA_PROVIDER, type MediaProvider } from './media-provider';

@Global()
@Module({
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
          : new LocalMediaAdapter(env.MEDIA_BASE_URL),
    },
  ],
  exports: [MEDIA_PROVIDER],
})
export class MediaModule {}
