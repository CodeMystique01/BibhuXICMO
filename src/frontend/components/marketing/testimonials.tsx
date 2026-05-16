import { TESTIMONIALS } from "@/frontend/data/marketing-data";
import { Quote } from "lucide-react";

export function Testimonials() {
  const columns = [
    TESTIMONIALS.slice(0, 4),
    TESTIMONIALS.slice(4, 8),
    TESTIMONIALS.slice(8, 12),
  ];

  return (
    <section className="relative bg-muted/20 py-24 md:py-32">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-primary">
            What our users say
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Loved by builders and marketers.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {columns.map((col, idx) => (
            <div key={idx} className="flex flex-col gap-4">
              {col.map((t, i) => (
                <figure
                  key={i}
                  className="rounded-2xl border bg-card p-6 shadow-sm"
                >
                  <Quote className="h-5 w-5 text-primary/60" />
                  <blockquote className="mt-3 text-sm leading-relaxed text-foreground">
                    {t.quote}
                  </blockquote>
                  <figcaption className="mt-4 text-xs">
                    <div className="font-medium">{t.author}</div>
                    <div className="text-muted-foreground">{t.handle}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
