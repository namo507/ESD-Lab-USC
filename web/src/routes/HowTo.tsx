import { Link, useLocation } from "react-router-dom";
import { BookOpen, HelpCircle, Play, Sparkles } from "lucide-react";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { startNanoTour } from "@/components/help/tourEvents";
import {
  DOC_ROUTE,
  HOW_TO_CARDS,
  HOW_TO_ROUTE,
  OPERATOR_TOUR_STEPS,
  PUBLIC_TOUR_STEPS,
  type HowToCard,
} from "@/data/helpContent";
import { useUi } from "@/store/ui";
import styles from "./Docs.module.css";

function HelpNav() {
  const location = useLocation();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const current = location.pathname;

  function askHelp() {
    setChatSeed("Help me choose the right NANO dashboard how-to card for my current task.");
    setChatOpen(true);
  }

  return (
    <nav className={styles.nav} aria-label="How-to navigation">
      <Link to="/" className={styles.brand}>
        <span className={styles.mark}>e</span>
        <span className={styles.brandText}>
          <strong>ESD Lab</strong>
          <small>NANO . UofSC</small>
        </span>
      </Link>
      <div className={styles.links}>
        <Link className={styles.link} to="/">Landing</Link>
        <Link className={`${styles.link} ${current === DOC_ROUTE ? styles.active : ""}`} to={DOC_ROUTE}>
          <BookOpen size={14} strokeWidth={1.5} />
          Docs
        </Link>
        <Link className={`${styles.link} ${current === HOW_TO_ROUTE ? styles.active : ""}`} to={HOW_TO_ROUTE}>
          <HelpCircle size={14} strokeWidth={1.5} />
          How-to
        </Link>
        <Link className={styles.link} to="/overview">Operator</Link>
      </div>
      <button type="button" className={styles.navButton} onClick={() => startNanoTour("public")} data-insight="tour-trigger">
        <Sparkles size={14} strokeWidth={1.5} />
        Take the tour
      </button>
      <button type="button" className={styles.primaryButton} onClick={askHelp}>
        Ask the lab
      </button>
      <ThemeToggle variant="pill" />
    </nav>
  );
}

function AnnotatedFigure({ card }: { card: HowToCard }) {
  return (
    <figure className={styles.figure} aria-label={card.figure.label}>
      <figcaption className={styles.figureLabel}>{card.figure.label}</figcaption>
      <div className={styles.figurePanel} aria-hidden="true" />
      {card.figure.pins.map((pin) => (
        <span
          key={pin.n}
          className={styles.pin}
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          aria-label={`${pin.n}. ${pin.label}`}
        >
          <span className={styles.pinNumber}>{pin.n}</span>
          <span>{pin.label}</span>
        </span>
      ))}
    </figure>
  );
}

function HowToCardView({ card }: { card: HowToCard }) {
  return (
    <article className={styles.card}>
      <small>{card.goal}</small>
      <h3>{card.title}</h3>
      <ol>
        {card.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <AnnotatedFigure card={card} />
      <button type="button" className={styles.secondaryButton} onClick={() => startNanoTour(card.track)}>
        <Play size={14} strokeWidth={1.5} />
        Show me
      </button>
    </article>
  );
}

export function HowTo() {
  return (
    <div className={styles.page}>
      <HelpNav />
      <main className={styles.main} data-insight="howto-hub">
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>How-to</span>
            <h1>Learn the dashboard by doing.</h1>
            <p className={styles.lede}>
              Short task cards, quiet annotated figures, and Buddy-led guided tours for new lab members,
              clinicians, researchers, and operators.
            </p>
          </div>
          <aside className={styles.heroCard} data-insight="tour-trigger">
            <span className={styles.eyebrow}>Visual tutorial</span>
            <h2>Walk the real UI.</h2>
            <p>
              Start with the public tour for the landing page, or use the operator tour when you are inside the lab console.
              Reduced-motion users can read the annotated figures below instead.
            </p>
            <div className={styles.heroActions}>
              <button type="button" className={styles.primaryButton} onClick={() => startNanoTour("public")}>
                <Play size={14} strokeWidth={1.5} />
                Public tour
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => startNanoTour("operator")}>
                <Play size={14} strokeWidth={1.5} />
                Operator tour
              </button>
            </div>
          </aside>
        </header>

        <section className={styles.section} id="tasks">
          <span className={styles.eyebrow}>Task cards</span>
          <h2>Every interactive feature, one matching how-to</h2>
          <div className={styles.howGrid}>
            {HOW_TO_CARDS.map((card) => (
              <HowToCardView card={card} key={card.id} />
            ))}
          </div>
        </section>

        <section className={styles.section} id="tour-config">
          <span className={styles.eyebrow}>Tour tracks</span>
          <h2>Readable ordered config</h2>
          <div className={styles.grid2}>
            <article className={styles.card}>
              <small>Public tour</small>
              <h3>Landing route targets</h3>
              <div className={styles.tourList}>
                {PUBLIC_TOUR_STEPS.map((step) => (
                  <div className={styles.tourStep} key={step.id}>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{step.route} . data-tour=&quot;{step.target}&quot;</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className={styles.card}>
              <small>Operator tour</small>
              <h3>Console route targets</h3>
              <div className={styles.tourList}>
                {OPERATOR_TOUR_STEPS.map((step) => (
                  <div className={styles.tourStep} key={step.id}>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{step.route} . data-tour=&quot;{step.target}&quot;</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section} id="maintain">
          <span className={styles.eyebrow}>For future features</span>
          <h2>Keep help automatic</h2>
          <div className={styles.grid2}>
            <article className={styles.card}>
              <small>When adding UI</small>
              <h3>Add one help card</h3>
              <p>
                Add the feature to the shared help content module with a goal, steps, visual pins, and the right tour track.
                The How-to page updates from that source.
              </p>
            </article>
            <article className={styles.card}>
              <small>When adding metrics</small>
              <h3>Add insight and tour hooks</h3>
              <p>
                Add data-insight for Buddy explanations and data-tour for walkthrough targeting. Metric visualizations should
                expose their live hook source in docs instead of copying values into static prose.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Buddy anchor="page" />
      <ChatDrawer />
    </div>
  );
}
