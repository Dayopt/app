export const maxDuration = 5;

function retiredSystemApiNotFound(): Response {
  return new Response(null, { status: 404 });
}

export const GET = retiredSystemApiNotFound;
export const POST = retiredSystemApiNotFound;
export const OPTIONS = retiredSystemApiNotFound;
