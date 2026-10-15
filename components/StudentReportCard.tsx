// components/StudentReportCard.tsx
// Satu "Student Learning Report" — format sama dengan PDF (lib/reportPdf.ts).
import type { PdfStudent } from "@/lib/reportTypes";

export default function StudentReportCard({ s, index }: { s: PdfStudent; index: number }) {
  return (
    <article lang="en" className="slr-card" style={{ page: `slr-${index}` } as any}>
      <img src="/report-banner.jpg" alt="School logos" className="slr-banner" />
      <h2 className="slr-title">Student Learning Report</h2>
      <p className="slr-meta">Name: {s.name}</p>
      <p className="slr-meta">Class: {s.className}</p>
      <hr className="slr-rule-dark" />

      {s.subjects.length === 0 && (
        <p className="slr-muted">No exam results have been recorded for this student yet.</p>
      )}

      {s.subjects.map((sub) => (
        <section key={sub.name} className="slr-subject">
          {/* Judul mapel + "Mastered" + baris pertamanya tidak dipisah halaman */}
          <div className="slr-keep">
            <h3 className="slr-subject-title">{sub.name}</h3>
            <hr className="slr-rule" />
            <p className="slr-mastered">
              Mastered ({sub.masteredCount} of {sub.total} questions answered fully correctly)
              {sub.masteredIndicators.length ? ":" : ""}
            </p>
            {sub.masteredIndicators.slice(0, 1).map((t) => (
              <div key={t} className="slr-row">
                <span className="slr-marker">1.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="slr-mastered-list">
            {sub.masteredIndicators.slice(1).map((t, i) => (
              <div key={t} className="slr-row slr-keep">
                <span className="slr-marker">{i + 2}.</span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          {(
            [
              ["Needs Reinforcement:", "slr-reinf", sub.reinforcement],
              ["Needs More Understanding:", "slr-more", sub.more],
            ] as const
          ).map(([title, cls, groups]) =>
            groups.length === 0 ? null : (
              <div key={title} className="slr-section">
                {groups.map((g, gi) => {
                  const itemRow = (it: (typeof g.items)[number], k: number) => (
                    <div key={k} className="slr-row slr-item slr-keep">
                      <span className="slr-marker">{"abcdefghijklmnopqrstuvwxyz"[k] ?? k + 1}.</span>
                      <div>
                        <div>{it.text || it.number}</div>
                        {it.reasoning && <div className="slr-reason">{it.reasoning}</div>}
                      </div>
                    </div>
                  );
                  return (
                    <div key={gi} className="slr-group">
                      {/* Judul kategori (kelompok pertama) + judul indikator + soal pertama tidak dipisah */}
                      <div className="slr-keep">
                        {gi === 0 && <p className={`slr-cat ${cls}`}>{title}</p>}
                        {g.indicator ? (
                          <div className="slr-row slr-group-head">
                            <span className="slr-marker slr-bold">{gi + 1}.</span>
                            <div>
                              <div className="slr-bold">{g.indicator}</div>
                              <div className="slr-muted">
                                ({g.correct} of {g.total} correct)
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className={g.indicator ? "slr-items" : ""}>
                          {g.items.slice(0, 1).map(itemRow)}
                        </div>
                      </div>
                      <div className={g.indicator ? "slr-items" : ""}>
                        {g.items.slice(1).map((it, k) => itemRow(it, k + 1))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </section>
      ))}

      {s.indicatorMap.length > 0 && (
        <section className="slr-map">
          {s.indicatorMap.map((m, mi) => (
            <div key={m.subject}>
              <div className="slr-keep">
                {mi === 0 && (
                  <>
                    <h3 className="slr-map-title">Indicator Map: which questions assess each indicator</h3>
                    <hr className="slr-rule slr-map-rule" />
                  </>
                )}
                <p className={`slr-map-subject${mi === 0 ? " slr-first" : ""}`}>{m.subject}</p>
                {m.entries.slice(0, 1).map((e) => (
                  <div key={0} className="slr-row slr-map-row">
                    <span className="slr-marker">1.</span>
                    <span>
                      {e.indicator}: <i className="slr-muted">Questions {e.questions}</i>
                    </span>
                  </div>
                ))}
              </div>
              {m.entries.slice(1).map((e, i) => (
                <div key={i} className="slr-row slr-map-row slr-keep">
                  <span className="slr-marker">{i + 2}.</span>
                  <span>
                    {e.indicator}: <i className="slr-muted">Questions {e.questions}</i>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}
