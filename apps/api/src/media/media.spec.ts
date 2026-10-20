import { createHash } from 'node:crypto';
import { CloudinaryMediaAdapter, cloudinarySign } from './cloudinary-media.adapter';
import { LocalMediaAdapter } from './local-media.adapter';
import { sanitizeSvg } from './svg-sanitizer';

describe('sanitizeSvg', () => {
  it('keeps safe shapes and viewBox', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0L4 4" fill="#fff"/></svg>',
    );
    expect(out).toContain('viewBox="0 0 4 4"');
    expect(out).toContain('<path d="M0 0L4 4" fill="#fff"');
  });

  it('drops scripts, handlers, foreign objects and external references', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 1 1"><script>x()</script><foreignObject><div>h</div></foreignObject>' +
        '<style>@import url(http://evil.test/a.css)</style>' +
        '<use href="http://evil.test/x.svg#a"/><use href="#ok"/>' +
        '<rect fill="url(http://evil.test/p)" stroke="javascript:alert(1)" onmouseover="x()"/></svg>',
    );
    expect(out).not.toMatch(/script|foreignObject|style|evil|javascript|onmouseover|<div/i);
    expect(out).toContain('href="#ok"');
  });
});

describe('media adapters', () => {
  it('local adapter signs, builds URLs and stores objects without network', async () => {
    const media = new LocalMediaAdapter('http://media.test');
    const sig = media.signUpload('font');
    expect(sig.publicId).toMatch(/^fonts\//);
    expect(media.thumbnailUrl('patterns/a')).toBe('http://media.test/patterns/a/thumb.webp');
    await media.putObject('x/y', Buffer.from('1'), 'text/plain');
    expect(media.objects.has('x/y')).toBe(true);
    await media.delete('x/y');
    expect(media.objects.has('x/y')).toBe(false);
  });

  it('cloudinary adapter produces deterministic signatures and WebP URLs', () => {
    const params = {
      timestamp: 1315060510,
      public_id: 'sample_image',
      eager: 'c_fill,h_150,w_100|c_crop,h_200,w_260',
      callback: 'https://www.example.com/cloudinary_cors.html',
    };
    const expected = createHash('sha1')
      .update(
        'callback=https://www.example.com/cloudinary_cors.html&eager=c_fill,h_150,w_100|c_crop,h_200,w_260&public_id=sample_image&timestamp=1315060510abcd',
      )
      .digest('hex');
    expect(cloudinarySign(params, 'abcd')).toBe(expected);
    const media = new CloudinaryMediaAdapter({ cloudName: 'demo', apiKey: 'k', apiSecret: 's' });
    const sig = media.signUpload('pattern');
    expect(sig.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(sig.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(media.thumbnailUrl('patterns/a')).toContain('f_webp');
  });
});
