import { getLivePositionsRoute } from '../../../../api/routes.js';

export async function GET() {
  return getLivePositionsRoute();
}
