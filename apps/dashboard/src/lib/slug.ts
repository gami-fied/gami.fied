import { useCallback, useState } from 'react';

/** "Acme Corp!" → "acme-corp": lowercase letters, numbers and single dashes, none at the ends. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * What a person may type in a slug field. Dashes stay as typed, including one at the end, so
 * "acme-" can become "acme-corp".
 */
export function cleanTypedSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * A name field and a slug field. The slug follows the name until the person edits the slug
 * themselves, and follows it again if they empty it.
 */
export function useSlugFromName() {
  const [name, setNameValue] = useState('');
  const [slug, setSlugValue] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const setName = useCallback(
    (value: string) => {
      setNameValue(value);
      if (!slugEdited) setSlugValue(slugify(value));
    },
    [slugEdited]
  );

  const setSlug = useCallback((value: string) => {
    const cleaned = cleanTypedSlug(value);
    setSlugValue(cleaned);
    setSlugEdited(cleaned !== '');
  }, []);

  const reset = useCallback(() => {
    setNameValue('');
    setSlugValue('');
    setSlugEdited(false);
  }, []);

  return { name, slug, setName, setSlug, reset };
}
