import { useEffect, useState } from 'react';

/**
 * The address to show in code samples. Published images have no address built in, and the
 * dashboard forwards `/v1` to the API, so its own address works for any install.
 */
export function usePublicApiUrl(): string {
  const [url, setUrl] = useState(process.env.NEXT_PUBLIC_API_URL ?? '');

  useEffect(() => {
    if (!url) setUrl(window.location.origin);
  }, [url]);

  return url;
}
