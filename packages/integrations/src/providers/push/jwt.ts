import { createSign, type KeyObject, type SignPrivateKeyInput } from 'crypto';

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/**
 * Signs a JSON Web Token. `RS256` is what Google asks for, and `ES256` is what Apple asks for.
 * Apple wants the raw (r, s) signature form, so that one is asked for as `ieee-p1363`.
 */
export function signJwt(
  algorithm: 'RS256' | 'ES256',
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: string | KeyObject
): string {
  const input = `${b64(JSON.stringify({ alg: algorithm, typ: 'JWT', ...header }))}.${b64(JSON.stringify(claims))}`;
  const signer = createSign(algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
  signer.update(input);
  const signature =
    algorithm === 'RS256' ? signer.sign(key) : signer.sign({ key, dsaEncoding: 'ieee-p1363' } as SignPrivateKeyInput);
  return `${input}.${b64(signature)}`;
}
