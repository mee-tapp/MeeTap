import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "./client";

export type AccountType = "personal" | "business";

export type Profile = {
  id: string;
  display_name: string | null;
  home_city: string | null;
  account_type: AccountType;
  business_name: string | null;
};

type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
  accountType: AccountType;
  businessName?: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True until the initial session check (and, if signed in, the profile fetch) resolves. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    input: SignUpInput,
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    patch: Partial<Pick<Profile, "display_name" | "home_city" | "business_name" | "account_type">>,
  ) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          display_name: input.displayName,
          account_type: input.accountType,
          business_name: input.businessName ?? null,
        },
      },
    });
    // Email confirmation is on: signUp succeeds but returns no session yet.
    const needsEmailConfirmation = !error && !data.session;
    return { error: error?.message ?? null, needsEmailConfirmation };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/account` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    return { error: error?.message ?? null };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const updateProfile = useCallback(
    async (
      patch: Partial<
        Pick<Profile, "display_name" | "home_city" | "business_name" | "account_type">
      >,
    ) => {
      if (!session?.user) return { error: "Not signed in" };
      const { error } = await supabase.from("profiles").update(patch).eq("id", session.user.id);
      if (!error) await loadProfile(session.user.id);
      return { error: error?.message ?? null };
    },
    [session, loadProfile],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        resetPassword,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
