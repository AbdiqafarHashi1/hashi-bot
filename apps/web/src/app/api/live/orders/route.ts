import { getLiveOrdersRoute } from '../../../../api/routes.js';

export async function GET() {
  return getLiveOrdersRoute();
}
