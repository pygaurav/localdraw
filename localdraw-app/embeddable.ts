export const validateEmbeddableUrl = (link: string): boolean => {
  try {
    const url = new URL(link);
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : null;

    if (currentOrigin && url.origin === currentOrigin) {
      return false;
    }

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};
