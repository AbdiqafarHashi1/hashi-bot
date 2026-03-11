import { getLiveSafetyRoute } from '../../../../api/routes.js';

export async function GET() {
  return getLiveSafetyRoute();
}
