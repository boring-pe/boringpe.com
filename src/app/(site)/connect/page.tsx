import type { Metadata } from "next";
import { ConnectForm } from "./form";

export const metadata: Metadata = {
  title: "Connect with Us | Boring PE",
  description: "Pick a time to talk with Boring PE about Build, Co-Build, Own, founder advisory with Rahul Mane or Impact Marrow.",
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  return (
    <section className="px-6 pt-28 pb-20">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight text-white">Connect with Us</h1>
        <p className="mt-2 mb-8 text-base text-slate-400">A conversation with Boring PE. Pick a time, then tell us who you are.</p>
        <ConnectForm topic={topic} />
      </div>
    </section>
  );
}
