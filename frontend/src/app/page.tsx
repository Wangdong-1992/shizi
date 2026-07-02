/**
 * Home Page — Redirects to /dashboard or /login.
 */

import { redirect } from 'next/navigation';

export default function HomePage(): never {
  // Simple redirect — middleware handles actual auth logic
  redirect('/dashboard');
}
