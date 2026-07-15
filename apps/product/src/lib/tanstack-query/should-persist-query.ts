interface PersistableQuery {
  state: {
    status: string;
    data: unknown;
  };
  meta?: Readonly<Record<string, unknown>> | undefined;
}

/** 成功データだけを永続化し、機密性のある一時queryは明示的に除外する。 */
export function shouldPersistQuery(query: PersistableQuery): boolean {
  return (
    query.meta?.persist !== false &&
    query.state.status === 'success' &&
    query.state.data !== undefined
  );
}
