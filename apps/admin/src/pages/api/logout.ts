import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../lib/api';

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/', 303);
};
