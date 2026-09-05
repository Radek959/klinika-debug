const TOKEN_KEY = "klinika-debug-token";

export function saveToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function readToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}
