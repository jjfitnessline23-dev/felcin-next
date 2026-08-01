import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In or Sign Up",
  description: "Join Felcin — the fitness social app. Sign up free to track runs, share workouts, follow top trainers, and connect with your fitness community.",
  alternates: { canonical: "https://www.felcin.com/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
