import { Mail, MessageCircle, Zap } from "lucide-react";
import { CONTACT, mailto } from "@/shared/site";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  const channels = [
    { icon: Mail, label: "Support", value: CONTACT.support, href: mailto(CONTACT.support) },
    { icon: MessageCircle, label: "Sales", value: CONTACT.sales, href: mailto(CONTACT.sales) },
    { icon: Zap, label: "Partnerships", value: CONTACT.hello, href: mailto(CONTACT.hello) },
  ];

  return (
    <section className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Contact</h1>
      <p className="mt-3 text-muted-foreground">
        The fastest way to reach us is email. We reply within a business day.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {channels.map(({ icon: Icon, label, value, href }) => (
          <a
            key={label}
            href={href}
            className="group rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <Icon className="mb-3 h-5 w-5 text-primary" />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 font-medium group-hover:text-primary">{value}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
