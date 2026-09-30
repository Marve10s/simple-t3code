export function shouldHandleAppLink(url: string): boolean {
  return (
    !url.includes("expo-development-client") &&
    !url.includes("://expo-sharing") &&
    !/^t3code(-dev|-preview)?:\/*$/.test(url)
  );
}
