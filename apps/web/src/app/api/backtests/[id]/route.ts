import { getBacktestByIdRoute } from '../../../../api/routes.js';

export function GET(id: string) {
  return getBacktestByIdRoute(id);
}
