import { getLiveHealthRoute } from '../../../../api/routes.js';

export async function GET() {
  return getLiveHealthRoute();
}
