import { getLiveIncidentsRoute } from '../../../../api/routes.js';

export async function GET() {
  return getLiveIncidentsRoute();
}
