declare module 'multer' {
  import type { Request, Response } from 'express';
  type Middleware = (req: Request, res: Response, next: (err?: unknown) => void) => void;
  interface Multer {
    single(field: string): Middleware;
  }
  interface Options {
    storage?: unknown;
    limits?: Record<string, number>;
  }
  function multer(options?: Options): Multer;
  namespace multer {
    function memoryStorage(): unknown;
  }
  export = multer;
}
