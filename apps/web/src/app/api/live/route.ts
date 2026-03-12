import { getLiveRoute } from '../../../api/routes.js';

export async function GET() {
  return getLiveRoute();
}
