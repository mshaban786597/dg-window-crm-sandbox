"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PanelsTopLeft, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP, SANDBOX_MODE } from "@/lib/domain";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const enter = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    router.push("/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await enter();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-sidebar p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
              <PanelsTopLeft className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{APP.name}</h1>
              <p className="text-slate-400 text-sm">{APP.subtitle}</p>
            </div>
          </div>
          <div className="mt-16 space-y-6">
            <h2 className="text-3xl font-bold leading-tight">
              Manage window leads, measurements, orders & installs — all in one place.
            </h2>
            <p className="text-slate-400 text-lg">
              A window sales and operations CRM for replacement, installation, impact,
              energy-efficient, and commercial window projects.
            </p>
            <ul className="space-y-3 text-slate-300">
              {[
                "Lead pipeline & proposal management",
                "Measurements, window orders & install tracking",
                "Crew scheduling & job management",
                "DG Window Growth Assistant",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-sm text-slate-500">{APP.name} — {APP.subtitle}</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue lg:hidden">
              <PanelsTopLeft className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Sign in to {APP.name}</CardTitle>
            <CardDescription>{APP.subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            {SANDBOX_MODE && (
              <div className="mb-5">
                <Button
                  type="button"
                  onClick={enter}
                  disabled={loading}
                  className="w-full bg-brand-blue hover:bg-brand-blue-dark"
                >
                  {loading ? "Entering…" : "Enter Sandbox"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Local sandbox — no real authentication or production data.
                </p>
                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or sign in
                  <span className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    className="pl-9"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    className="pl-9"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
