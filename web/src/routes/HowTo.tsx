import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, HelpCircle, Play, Sparkles } from "lucide-react";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { SkinToggle } from "@/components/shell/SkinToggle";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { HowToFigure } from "@/components/help/HowToFigure";
import { startNanoTour } from "@/components/help/tourEvents";
import {
  DOC_ROUTE,
  HOW_TO_CARDS,
  HOW_TO_ROUTE,
  OPERATOR_TOUR_STEPS,
  PUBLIC_TOUR_STEPS,
  type HowToCard,
  type TourStep,
} from "@/data/helpContent";
import { fromDiscoveryPath, isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import { useUi } from "@/store/ui";
import styles from "./Docs.module.css";
import local from "./HowTo.module.css";

function HelpNav() {
  const location = useLocation();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const current = fromDiscoveryPath(location.pathname);
  const inDiscovery = isDiscoveryPath(location.pathname);
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);

  function askHelp() {
    setChatSeed("Help me choose the right NANO dashboard how-to card for my current task.");
    setChatOpen(true);
  }

  return (
    <nav className={styles.nav} aria-label="How-to navigation">
      <Link to={route("/")} className={styles.brand}>
        <span className={styles.mark}>e</span>
        <span className={styles.brandText}>
          <strong>ESD Lab</strong>
          <small>NANO . UofSC</small>
        </span>
      </Link>
      <div className={styles.links}>
        <Link className={styles.link} to={route("/")}>Landing</Link>
        <Link className={`${styles.link} ${current === DOC_ROUTE ? styles.active : ""}`} to={route(DOC_ROUTE)}>
          <BookOpen size={14} strokeWidth={1.5} />
          Docs
        </Link>
        <Link className={`${styles.link} ${current === HOW_TO_ROUTE ? styles.active : ""}`} to={route(HOW_TO_ROUTE)}>
          <HelpCircle size={14} strokeWidth={1.5} />
          How-to
        </Link>
        <Link className={styles.link} to={route("/overview")}>Operator</Link>
      </div>
      <button type="button" className={styles.navButton} onClick={() => startNanoTour("public")} data-insight="tour-trigger">
        <Sparkles size={14} strokeWidth={1.5} />
        Take the tour
      </button>
      <button type="button" className={styles.primaryButton} onClick={askHelp}>
        Ask the lab
      </button>
      <SkinToggle variant="pill" />
      <ThemeToggle variant="pill" />
    </nav>
  );
}

function HowToCardView({ card }: { card: HowToCard }) {
  const [activeN, setActiveN] = useState<number | null>(null);
  const pinNumbers = new Set(card.figure.pins.map((pin) => pin.n));

  return (
    <article className={styles.card}>
      <small>{card.goal}</small>
      <h3>{card.title}</h3>

      <ul className={local.steps}>
        {card.steps.map((step, index) => {
          const n = index + 1;
          const linked = pinNumbers.has(n);
          return (
            <li
              key={step}
              className={`${local.step} ${activeN === n ? local.stepActive : ""}`}
              onMouseEnter={() => linked && setActiveN(n)}
              onMouseLeave={() => linked && setActiveN(null)}
            >
              <span className={local.stepNum}>{n}</span>
              <span>{step}</span>
            </li>
          );
        })}
      </ul>

      <figure className={`${styles.figure} ${local.figureBox}`} aria-label={card.figure.label}>
        <figcaption className={styles.figureLabel}>{card.figure.label}</figcaption>
        <HowToFigure kind={card.figure.kind} pins={card.figure.pins} activeN={activeN} onHover={setActiveN} />
      </figure>

      <div className={local.sublinks}>
        <span className={local.sublinkLead}>Go to</span>
        <Link className={local.openLink} to={card.route}>
          Open this surface
          <ArrowRight size={13} strokeWidth={1.8} />
        </Link>
        {card.links.map((link) => (
          <Link key={link.to} className={local.deepLink} to={link.to}>
            {link.label}
          </Link>
        ))}
        <button type="button" className={styles.secondaryButton} onClick={() => startNanoTour(card.track)}>
          <Play size={14} strokeWidth={1.5} />
          Show me
        </button>
      </div>
    </article>
  );
}

function TourIndex({ steps }: { steps: TourStep[] }) {
  return (
    <div className={local.tourIndex}>
      {steps.map((step, index) => (
        <Link key={step.id} className={local.tourRow} to={step.route}>
          <span className={local.tourRowNum}>{index + 1}</span>
          <span className={local.tourRowBody}>
            <strong>{step.title}</strong>
            <span>{step.body}</span>
          </span>
          <span className={local.tourRowGo}>
            {step.route}
            <ArrowRight size={12} strokeWidth={1.8} />
          </span>
        </Link>
      ))}
    </div>
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
              Short task cards, annotated schematic figures, and Buddy-led guided tours for new lab members,
              clinicians, researchers, and operators. Every card links straight to the live surface it describes.
            </p>
          </div>
          <aside className={styles.heroCard} data-insight="tour-trigger">
            <span className={styles.eyebrow}>Visual tutorial</span>
            <h2>Walk the real UI.</h2>
            <p>
              Hover a step to light up the matching point on the figure, then use the links to open the real surface.
              Start with the public tour for the landing page, or the operator tour inside the lab console. Reduced-motion
              users can read the annotated figures instead.
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
          <h2>Step-by-step, each linked to its route</h2>
          <div className={styles.grid2}>
            <article className={styles.card}>
              <small>Public tour</small>
              <h3>Landing walkthrough</h3>
              <TourIndex steps={PUBLIC_TOUR_STEPS} />
              <div className={local.sublinks}>
                <button type="button" className={styles.secondaryButton} onClick={() => startNanoTour("public")}>
                  <Play size={14} strokeWidth={1.5} />
                  Launch public tour
                </button>
              </div>
            </article>
            <article className={styles.card}>
              <small>Operator tour</small>
              <h3>Console walkthrough</h3>
              <TourIndex steps={OPERATOR_TOUR_STEPS} />
              <div className={local.sublinks}>
                <button type="button" className={styles.secondaryButton} onClick={() => startNanoTour("operator")}>
                  <Play size={14} strokeWidth={1.5} />
                  Launch operator tour
                </button>
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
                Add the feature to the shared help content module with a goal, steps, a figure kind, scene pins, the route
                it opens, deep sublinks, and the right tour track. The How-to page renders the schematic figure and links
                from that source.
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
