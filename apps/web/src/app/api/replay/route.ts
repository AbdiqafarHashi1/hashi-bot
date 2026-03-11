import { createReplayRoute, getReplayRunsRoute, type CreateReplayRoutePayload } from '../../../api/routes.js';

export function GET() {
  return getReplayRunsRoute();
}

export function POST(payload: CreateReplayRoutePayload) {
  return createReplayRoute(payload);
}
