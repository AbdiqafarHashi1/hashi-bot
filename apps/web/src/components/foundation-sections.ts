export interface PageSection<TData = unknown> {
  key: string;
  title: string;
  description: string;
  data: TData;
}

export function createSection<TData>(
  key: string,
  title: string,
  description: string,
  data: TData
): PageSection<TData> {
  return { key, title, description, data };
}
