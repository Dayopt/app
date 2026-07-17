import 'server-only';

import { initTRPC } from '@trpc/server';

class ProductOperatorTrpcSmokeError extends Error {
  constructor() {
    super('Dayopt Product operator tRPC Sentry smoke');
    this.name = 'ProductOperatorTrpcSmokeError';
  }
}

const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: error.code === 'INTERNAL_SERVER_ERROR' ? 'Operator smoke captured' : shape.message,
      data: {
        ...shape.data,
        stack: undefined,
      },
    };
  },
});

export const operatorSmokeRouter = t.router({
  capture: t.procedure.mutation(() => {
    throw new ProductOperatorTrpcSmokeError();
  }),
});

export type OperatorSmokeRouter = typeof operatorSmokeRouter;
