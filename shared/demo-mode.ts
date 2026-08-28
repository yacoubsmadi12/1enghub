export function selectLiveOrDemo<T>(options: {
  authenticated: boolean;
  fetched: boolean;
  live: T[] | undefined;
  demo: T[];
}): T[] {
  if (options.authenticated && options.fetched) return options.live ?? [];
  return options.demo;
}
