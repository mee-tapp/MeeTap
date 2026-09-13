import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTypeToggle } from "./account-type-toggle";
import { GoogleIcon } from "./google-icon";
import { useAuth, type AccountType } from "@/lib/auth/auth-context";
import meetapLogo from "@/assets/meetap-logo.png";

type Mode = "signin" | "signup";

export function AuthCard({ defaultMode = "signin" }: { defaultMode?: Mode }) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>(defaultMode);
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: "/account" });
  };

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    if (!displayName.trim()) {
      toast.error(accountType === "business" ? "Enter a contact name." : "Enter your name.");
      return;
    }
    if (accountType === "business" && !businessName.trim()) {
      toast.error("Enter your restaurant/business name.");
      return;
    }

    setSubmitting(true);
    const { error, needsEmailConfirmation } = await signUp({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      accountType,
      ...(accountType === "business" ? { businessName: businessName.trim() } : {}),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (needsEmailConfirmation) {
      toast.success("Account created — check your email to confirm it before signing in.");
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      return;
    }
    toast.success("Account created!");
    navigate({ to: "/account" });
  };

  const handleGoogle = async () => {
    const { error } = await signInWithGoogle();
    if (error) toast.error(`Google sign-in isn't set up yet (${error}).`);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Enter your email first, then tap Forgot password.");
      return;
    }
    const { error } = await resetPassword(email.trim());
    if (error) toast.error(error);
    else toast.success("Password reset email sent — check your inbox.");
  };

  return (
    <div className="glass-panel relative w-full max-w-md overflow-hidden rounded-3xl p-7 sm:p-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 -z-10 size-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="flex flex-col items-center text-center">
        <img
          src={meetapLogo}
          alt=""
          className="size-12 rounded-xl object-cover shadow-[var(--shadow-button)]"
        />
        <h1 className="mt-4 text-2xl font-semibold">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {mode === "signin"
            ? "Sign in to save places, track your search history and write reviews."
            : "Join MeeTap to get recommendations tailored to you."}
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-7">
        <TabsList className="grid w-full grid-cols-2 rounded-full">
          <TabsTrigger value="signin" className="rounded-full">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signup" className="rounded-full">
            Create account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-6">
          <form className="space-y-4" onSubmit={handleSignIn}>
            <div className="space-y-1.5">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="signin-password">Password</Label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="signin-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              variant="hero"
              className="w-full rounded-full"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-6">
          <form className="space-y-4" onSubmit={handleSignUp}>
            <AccountTypeToggle value={accountType} onChange={setAccountType} />
            <div className="space-y-1.5">
              <Label htmlFor="signup-name">
                {accountType === "business" ? "Contact name" : "Name"}
              </Label>
              <Input
                id="signup-name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={accountType === "business" ? "Who should we contact?" : "Your name"}
              />
            </div>
            {accountType === "business" && (
              <div className="space-y-1.5">
                <Label htmlFor="signup-business">Restaurant / business name</Label>
                <Input
                  id="signup-business"
                  required
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="e.g. Mirth Café"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-password">Password</Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-confirm">Confirm password</Label>
              <Input
                id="signup-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
              />
            </div>
            <Button
              type="submit"
              variant="hero"
              className="w-full rounded-full"
              disabled={submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="glass"
        className="mt-6 w-full rounded-full"
        onClick={handleGoogle}
      >
        <GoogleIcon className="size-4" /> Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="font-medium text-foreground hover:underline"
            >
              Create account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="font-medium text-foreground hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
