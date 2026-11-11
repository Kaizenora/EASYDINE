import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertValidImageSignature, uploadsDir } from './image-upload.config';

describe('image upload validation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'upl-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, bytes: number[] | string) => {
    const p = join(dir, name);
    writeFileSync(p, typeof bytes === 'string' ? bytes : Buffer.from(bytes));
    return p;
  };

  it('accepts real PNG / JPEG / GIF / WEBP signatures', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(() => assertValidImageSignature(write('a.png', png))).not.toThrow();
    expect(() => assertValidImageSignature(write('a.jpg', [0xff, 0xd8, 0xff, 0xe0]))).not.toThrow();
    expect(() => assertValidImageSignature(write('a.gif', [0x47, 0x49, 0x46, 0x38]))).not.toThrow();
    expect(() => assertValidImageSignature(write('a.webp', webp))).not.toThrow();
  });

  it('rejects and deletes a non-image saved as .jpg', () => {
    const p = write('evil.jpg', '<html><script>alert(1)</script></html>');
    expect(() => assertValidImageSignature(p)).toThrow(BadRequestException);
    expect(existsSync(p)).toBe(false);
  });

  it('rejects an unreadable path', () => {
    expect(() => assertValidImageSignature(join(dir, 'missing.png'))).toThrow(BadRequestException);
  });

  it('honours UPLOADS_DIR so a persistent volume can be mounted there', () => {
    const prev = process.env.UPLOADS_DIR;
    const target = join(dir, 'vol');
    process.env.UPLOADS_DIR = target;
    expect(uploadsDir()).toBe(target);
    expect(existsSync(target)).toBe(true);
    if (prev === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = prev;
  });
});
