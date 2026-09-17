import './learning.css';

export function LearningArt({ variant = 'curriculum' }) {
  return (
    <svg className="lr-art" viewBox="0 0 250 165" fill="none" aria-hidden="true">
      <circle cx="137" cy="78" r="65" fill="#e5e7ff" />
      <circle cx="220" cy="40" r="16" fill="#d7f3e9" />
      <path
        d="M22 125C53 92 68 149 104 125C140 101 165 145 226 100"
        stroke="#c2c7ed"
        strokeWidth="2"
        strokeDasharray="5 6"
      />
      <g transform="rotate(-7 115 75)">
        <rect x="64" y="22" width="110" height="124" rx="15" fill="white" stroke="#d6dbef" />
        <rect x="81" y="39" width="44" height="6" rx="3" fill="#515bda" />
        <rect x="81" y="53" width="72" height="4" rx="2" fill="#d8ddea" />
        {[0, 1, 2].map((n) => (
          <g key={n} transform={`translate(0 ${n * 23})`}>
            <circle cx="89" cy="77" r="7" fill={n === 2 ? '#eceefd' : '#dbf4eb'} />
            <path
              d="m86 77 2 2 4-4"
              stroke={n === 2 ? '#6d73da' : '#188e71'}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <rect x="104" y="74" width={46 - n * 4} height="5" rx="2.5" fill="#b2b9d2" />
          </g>
        ))}
      </g>
      <rect
        x="160"
        y="95"
        width="55"
        height="46"
        rx="12"
        fill="#515bda"
        transform="rotate(7 160 95)"
      />
      {variant === 'career' ? (
        <path d="m179 123 8-13 8 13-8-3-8 3Z" fill="white" />
      ) : variant === 'lesson' ? (
        <path d="m181 109 14 10-14 10v-20Z" fill="white" />
      ) : (
        <path d="M187 108v22m-11-11h22" stroke="white" strokeWidth="3" strokeLinecap="round" />
      )}
      <circle cx="48" cy="53" r="11" fill="#ffdaac" />
      <path d="M198 53v14m-7-7h14" stroke="#aaaee0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LearningHeader({ eyebrow, title, description, variant, children }) {
  return (
    <section className="lr-hero">
      <div className="lr-hero-copy">
        <span className="lr-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      <LearningArt variant={variant} />
    </section>
  );
}

export function StatusPill({ status }) {
  const labels = {
    draft: '編集下書き',
    published: '学校へ提供中',
    approved: '教員承認済み',
    planned: '開始前',
    active: '授業中',
    completed: '終了',
  };
  return <span className={`lr-status lr-status-${status}`}>{labels[status] || status}</span>;
}

export function StepStrip({ items, active = 0 }) {
  return (
    <ol className="lr-step-strip">
      {items.map((item, i) => (
        <li key={item} className={i <= active ? 'is-done' : ''}>
          <span>{i + 1}</span>
          {item}
        </li>
      ))}
    </ol>
  );
}

export function LearningEmpty({ title, children }) {
  return (
    <div className="lr-empty">
      <div className="lr-empty-mark" aria-hidden="true">
        ◇
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
