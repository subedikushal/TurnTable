export interface AuthPrincipal {
  subject: string;
  email?: string;
  displayName?: string;
  scopes: string[];
}

export interface OidcTokenVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}

export const OIDC_TOKEN_VERIFIER = Symbol('OIDC_TOKEN_VERIFIER');
