/** 常に 404 で外部 I/O 無し。web の同一 route と同値。 */
export const maxDuration = 5;

function retiredSystemApiNotFound(): Response {
  return new Response(null, { status: 404 });
}

export const GET = retiredSystemApiNotFound;
export const POST = retiredSystemApiNotFound;
export const OPTIONS = retiredSystemApiNotFound;
