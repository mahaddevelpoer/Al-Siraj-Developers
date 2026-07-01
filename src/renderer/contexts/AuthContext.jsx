import { createContext, useState, useEffect, useContext } from 'react';
import { supabase, auth } from '../lib/supabase';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);

  useEffect(() => {
    checkAuth();

    const { data: authListener } = auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else {
        setUser(null);
        setUserRole(null);
        setUserProfile(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id || user?.local_offline === true) return undefined;
    let stopped = false;

    const writePresence = async (status = 'online') => {
      if (stopped) return;
      try {
        await supabase
          .from('users')
          .update({
            online_status: status,
            last_seen_at: new Date().toISOString(),
            device_label: 'Desktop ERP',
            last_active_context: document.hidden ? 'desktop_background' : 'desktop_active',
          })
          .eq('id', user.id);
      } catch (_) {
        // Presence columns are optional until src/sql/user-presence.sql is applied.
      }
    };

    writePresence('online');
    const timer = window.setInterval(() => writePresence('online'), 30000);
    const onVisibility = () => writePresence(document.hidden ? 'away' : 'online');
    window.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('visibilitychange', onVisibility);
      supabase
        .from('users')
        .update({
          online_status: 'offline',
          last_seen_at: new Date().toISOString(),
          last_active_context: 'desktop_signed_out_or_closed',
        })
        .eq('id', user.id)
        .then(() => {}, () => {});
    };
  }, [user?.id, user?.local_offline]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await withTimeout(auth.getSession(), 5000, 'Auth session');
      if (session?.user) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
        return;
      }
      const savedLocal = JSON.parse(localStorage.getItem('al_siraj_local_accountant_session') || 'null');
      if (savedLocal?.profile && savedLocal?.user && !savedLocal.profile.admin_password_set) {
        setUser({ ...savedLocal.user, local_offline: true });
        setUserProfile(savedLocal.profile);
        setUserRole('accountant');
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await withTimeout(supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single(), 5000, 'User profile');

      if (error) throw error;

      setUserProfile(data);
      setUserRole(data.role);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setUserProfile(null);
      setUserRole(null);
    }
  };

  const signUp = async (email, password, fullName, phone, role, town) => {
    try {
      const { data: authData, error: authError } = await auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone_number: phone, role, agent_town: town || null },
        },
      });

      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('users')
        .insert([{
          id: authData.user.id,
          email,
          full_name: fullName,
          phone_number: phone,
          role,
          agent_town: town || null,
          agent_towns: town || null,
          is_active: role === 'accountant',
        }]);

      if (profileError) {
        console.warn('Profile insert (non-critical):', profileError.message);
      }

      return { success: true, user: authData.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signIn = async (email, password, role = '', options = {}) => {
    try {
      if (role === 'accountant' && window.api?.localAccountantLogin) {
        const local = await window.api.localAccountantLogin({ email, password, adminPassword: options.adminPassword || '' });
        if (local?.success && local.profile) {
          let sessionUser = null;
          if (navigator.onLine) {
            try {
              const { data: onlineData, error: onlineError } = await withTimeout(auth.signInWithPassword({
                email,
                password,
              }), 6000, 'Online accountant auth');
              if (!onlineError && onlineData?.user) {
                sessionUser = onlineData.user;
              }
            } catch (_) {
              sessionUser = null;
            }
          }
          const fakeUser = { ...(local.user || { id: local.profile.id, email: local.profile.email }), local_offline: true };
          const activeUser = sessionUser || fakeUser;
          setUser(activeUser);
          setUserProfile(local.profile);
          setUserRole('accountant');
          if (options.remember !== false) {
            localStorage.setItem('al_siraj_local_accountant_session', JSON.stringify({
              user: activeUser,
              profile: local.profile,
              saved_at: new Date().toISOString(),
            }));
          }
          return { success: true, user: activeUser, profile: local.profile, localOffline: !sessionUser };
        }
      }
      const { data, error } = await withTimeout(auth.signInWithPassword({
        email,
        password,
      }), 8000, 'Online login');

      if (error) throw error;

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await auth.signOut();
      if (error && user?.local_offline !== true) throw error;
      localStorage.removeItem('al_siraj_local_accountant_session');
      setUser(null);
      setUserRole(null);
      setUserProfile(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    userRole,
    userProfile,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
