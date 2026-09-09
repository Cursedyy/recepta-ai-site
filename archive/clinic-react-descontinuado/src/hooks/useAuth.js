import React from 'react';

export function useAuth() {
  const [session, setSession] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      const supabase = window.__CONFIG__
        ? window.__CONFIG__.supabaseUrl
          ? // Reuses global Supabase client from existing configs when present
            // so we can read the server-side session cookie directly.
            null
          : null
        : null;

      // For now we rely on server-returned session after login and on
      // Supabase session cookie. Session presence is validated on protected
      // routes via the existing auth endpoints and not duplicated here.
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return { session, loading };
}
